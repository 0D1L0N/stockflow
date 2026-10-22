import { deleteDoc, doc, getDoc, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { telephoneFr, arrondi } from "@/lib/format";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits, type Format } from "./catalogue";
import { ajouterMouvement } from "./stock";
import { mouvementsVides } from "./casiers";

const oppose = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, n]) => [k, -n]));

/**
 * Fournisseurs, réceptions de marchandises et compte fournisseur.
 * solde_argent : ce que le dépôt doit au fournisseur.
 * emballages_dus : casiers que le dépôt doit rendre au fournisseur (négatif : le fournisseur nous en doit).
 */
export interface Fournisseur {
  id: Id; nom: string; telephone: string | null; adresse: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>; date_creation: string | null;
}

export interface LigneReception { casier?: number | null;
  format_id: Id; produit_nom: string; volume: number; unite: string;
  quantite: number; prix_achat: number; sous_total: number;
}

export interface Reception {
  id: Id; numero: string; numero_bl: string | null;
  fournisseur_id: Id; fournisseur_nom: string;
  lignes: LigneReception[]; format_ids: Id[];
  total: number; montant_paye: number; reste_du: number;
  emballages_livres: Record<string, number>; emballages_rendus: Record<string, number>;
  commentaire: string | null; date: string; utilisateur_nom: string;
}

/** Bon de commande envoyé au fournisseur ; « reçue » quand une réception le reprend. */
export interface LigneCommandeFournisseur { casier?: number | null; format_id: Id; quantite: number; produit_nom: string; volume: number; unite: string; }
export interface CommandeFournisseur {
  id: Id; numero: string; fournisseur_id: Id; fournisseur_nom: string;
  lignes: LigneCommandeFournisseur[]; note: string | null;
  statut: "envoyée" | "reçue"; reception_id: Id | null;
  date: string; utilisateur_nom: string;
}

export interface OperationFournisseur {
  id: Id; fournisseur_id: Id; type: "réception" | "paiement";
  montant: number; emballages: Record<string, number>;
  reception_id: Id | null; numero: string | null;
  commentaire: string | null; date: string; utilisateur_nom: string;
}

const nomUtilisateur = () => useAuthStore.getState().profil?.nom ?? "";
const entiers = (o: unknown): Record<string, number> => Object.fromEntries(
  Object.entries((o ?? {}) as Record<string, unknown>)
    .map(([k, v]) => [k, Math.trunc(Number(v))] as const)
    .filter(([, v]) => v > 0));
const plusRecent = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

async function lireFournisseur(id: Id): Promise<Fournisseur> {
  const snap = await getDoc(doc(db, "fournisseurs", id));
  if (!snap.exists()) throw new Error("Fournisseur introuvable.");
  return { id: snap.id, ...snap.data() } as Fournisseur;
}

/** Variation des soldes du fournisseur, tracée par une opération de journal dans le même batch. */
function mouvementCompte(
  batch: ReturnType<typeof writeBatch>, fournisseurId: Id,
  op: { type: OperationFournisseur["type"]; montant: number; emballages: Record<string, number>; reception_id?: Id | null; numero?: string | null; commentaire?: string | null },
) {
  const opRef = doc(col("operations_fournisseur"));
  batch.set(opRef, {
    fournisseur_id: fournisseurId, type: op.type, montant: op.montant, emballages: op.emballages,
    reception_id: op.reception_id ?? null, numero: op.numero ?? null, commentaire: op.commentaire ?? null,
    date: maintenant(), cree_le: serverTimestamp(),
    utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: nomUtilisateur(),
  });
  const emballages = Object.fromEntries(Object.entries(op.emballages).filter(([, n]) => n !== 0).map(([k, n]) => [k, increment(n)]));
  batch.set(doc(db, "fournisseurs", fournisseurId), {
    solde_argent: increment(op.montant),
    ...(Object.keys(emballages).length ? { emballages_dus: emballages } : {}),
    derniere_operation: opRef.id,
  }, { merge: true });
}

export const fournisseurs: Record<string, Commande> = {
  get_fournisseurs: async () => (await lister<Fournisseur>(col("fournisseurs"))).sort(parNom),

  create_fournisseur: async ({ nom, telephone, adresse }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez le nom du fournisseur.");
    const ref = doc(col("fournisseurs"));
    await ecrire(setDoc(ref, { nom: n, telephone: telephoneFr(telephone), adresse: adresse || null, date_creation: maintenant() }));
    return ref.id;
  },

  update_fournisseur: async ({ id, nom, telephone, adresse }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez le nom du fournisseur.");
    await ecrire(updateDoc(doc(db, "fournisseurs", id as Id), { nom: n, telephone: telephoneFr(telephone), adresse: adresse || null }));
  },

  /** Les réceptions passées restent dans l'historique (elles portent le nom du fournisseur). */
  delete_fournisseur: async ({ id }) => {
    const f = await lireFournisseur(id as Id);
    if ((f.solde_argent ?? 0) !== 0) throw new Error("Impossible de supprimer : le compte de ce fournisseur n'est pas soldé.");
    if (Object.values(f.emballages_dus ?? {}).some(n => n !== 0)) throw new Error("Impossible de supprimer : des casiers restent à échanger avec ce fournisseur.");
    await ecrire(deleteDoc(doc(db, "fournisseurs", id as Id)));
  },

  /**
   * Marchandises reçues : ajoute le stock de chaque ligne, enregistre le bon de réception,
   * la dette restante et les casiers échangés avec le fournisseur.
   */
  creer_reception: async ({ fournisseurId, numeroBl, lignes, montantPaye, emballagesRendus, commentaire, commandeId }) => {
    const f = await lireFournisseur(fournisseurId as Id);
    // Commande reprise : elle doit être en attente, chez ce fournisseur
    const commandeRef = commandeId ? doc(db, "commandes_fournisseur", commandeId as Id) : null;
    if (commandeRef) {
      const c = await getDoc(commandeRef);
      if (!c.exists()) throw new Error("Commande introuvable.");
      if (c.data().fournisseur_id !== f.id) throw new Error("Cette commande a été passée chez un autre fournisseur.");
      if (c.data().statut !== "envoyée") throw new Error("Cette commande a déjà été réceptionnée.");
    }
    const [formats, produits] = await Promise.all([listerFormats(), listerProduits()]);
    const parId = new Map(formats.map(x => [x.id, x]));
    const noms = new Map(produits.map(p => [p.id, p.nom]));

    // Lignes valides, un même format regroupé
    const cumul = new Map<Id, { quantite: number; prix: number }>();
    for (const l of (lignes ?? []) as { formatId: Id; quantite: unknown; prixAchat: unknown }[]) {
      const q = arrondi(Number(l.quantite)), p = Number(l.prixAchat) || 0;
      if (!(q > 0)) continue;
      if (p < 0) throw new Error("Un prix d'achat ne peut pas être négatif.");
      if (!parId.has(l.formatId)) throw new Error("Un produit de la réception n'existe plus.");
      const c = cumul.get(l.formatId);
      cumul.set(l.formatId, { quantite: (c?.quantite ?? 0) + q, prix: p || c?.prix || 0 });
    }
    if (cumul.size === 0) throw new Error("Ajoutez au moins un produit reçu.");

    const lignesFinales: LigneReception[] = [...cumul].map(([id, { quantite, prix }]) => {
      const fm = parId.get(id) as Format;
      return { format_id: id, produit_nom: noms.get(fm.produit_id) ?? "?", volume: fm.volume, unite: fm.unite, casier: fm.casier ?? null,
        quantite, prix_achat: prix, sous_total: quantite * prix };
    });
    const total = lignesFinales.reduce((t, l) => t + l.sous_total, 0);
    const paye = Number(montantPaye) || 0;
    if (paye < 0) throw new Error("Le montant payé ne peut pas être négatif.");
    if (paye > total) throw new Error("Le montant payé dépasse le total de la livraison. Réglez l'ancienne dette depuis le compte du fournisseur.");

    const livres: Record<string, number> = {};
    for (const l of lignesFinales) {
      const e = parId.get(l.format_id)?.emballage_id;
      if (e) livres[e] = (livres[e] ?? 0) + l.quantite;
    }
    const rendus = entiers(emballagesRendus);
    const delta: Record<string, number> = {};
    for (const k of new Set([...Object.keys(livres), ...Object.keys(rendus)])) delta[k] = (livres[k] ?? 0) - (rendus[k] ?? 0);

    const jour = maintenant().slice(0, 10).replace(/-/g, "");
    const recRef = doc(col("receptions"));
    const numero = `REC-${jour}-${recRef.id.slice(0, 4).toUpperCase()}`;
    const bl = String(numeroBl ?? "").trim() || null;
    const batch = writeBatch(db);
    batch.set(recRef, {
      numero, numero_bl: bl, fournisseur_id: f.id, fournisseur_nom: f.nom,
      lignes: lignesFinales, format_ids: lignesFinales.map(l => l.format_id),
      total, montant_paye: paye, reste_du: total - paye,
      emballages_livres: livres, emballages_rendus: rendus,
      commentaire: String(commentaire ?? "").trim() || null,
      date: maintenant(), cree_le: serverTimestamp(),
      utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: nomUtilisateur(), statut: "validée",
    });
    for (const l of lignesFinales) {
      const fm = parId.get(l.format_id) as Format;
      ajouterMouvement(batch, fm, l.produit_nom, {
        type: "entrée", quantite: l.quantite, stock_apres: arrondi(fm.stock + l.quantite), source: "réception fournisseur",
        commentaire: `${f.nom}${bl ? ` · BL ${bl}` : ""} · ${numero}`, reference_id: recRef.id,
      });
      // Le format cite la réception (les règles vérifient qu'il y figure)
      batch.update(doc(db, "formats", fm.id), { stock: increment(l.quantite), derniere_reception: recRef.id });
    }
    mouvementCompte(batch, f.id, { type: "réception", montant: total - paye, emballages: delta, reception_id: recRef.id, numero });
    // La commande cite la réception du batch (les règles le vérifient)
    if (commandeRef) batch.update(commandeRef, { statut: "reçue", reception_id: recRef.id });
    // Les vides rendus au livreur sortent du magasin
    await mouvementsVides(batch, oppose(rendus), { source: "réception fournisseur", reference_id: recRef.id, commentaire: `${f.nom} · ${numero}` });
    await ecrire(batch.commit());
    return { id: recRef.id, numero, total, reste_du: total - paye };
  },

  /** Bon de commande envoyé (WhatsApp ou PDF) : gardé en attente jusqu'à la livraison. */
  creer_commande_fournisseur: async ({ fournisseurId, lignes, note }) => {
    const f = await lireFournisseur(fournisseurId as Id);
    const [formats, produits] = await Promise.all([listerFormats(), listerProduits()]);
    const parId = new Map(formats.map(x => [x.id, x]));
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const cumul = new Map<Id, number>();
    for (const l of (lignes ?? []) as { formatId: Id; quantite: unknown }[]) {
      const q = arrondi(Number(l.quantite));
      if (!(q > 0)) continue;
      if (!parId.has(l.formatId)) throw new Error("Un produit de la commande n'existe plus.");
      cumul.set(l.formatId, (cumul.get(l.formatId) ?? 0) + q);
    }
    if (cumul.size === 0) throw new Error("Indiquez au moins une quantité.");
    const lignesFinales: LigneCommandeFournisseur[] = [...cumul].map(([id, quantite]) => {
      const fm = parId.get(id) as Format;
      return { format_id: id, quantite, produit_nom: noms.get(fm.produit_id) ?? "?", volume: fm.volume, unite: fm.unite, casier: fm.casier ?? null };
    });
    const ref = doc(col("commandes_fournisseur"));
    const date = maintenant();
    const numero = `BC-${date.slice(0, 10).replace(/-/g, "")}-${ref.id.slice(0, 4).toUpperCase()}`;
    await ecrire(setDoc(ref, {
      numero, fournisseur_id: f.id, fournisseur_nom: f.nom, lignes: lignesFinales,
      note: String(note ?? "").trim() || null, statut: "envoyée", reception_id: null,
      date, cree_le: serverTimestamp(), utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: nomUtilisateur(),
    }));
    return { id: ref.id, numero, date };
  },

  /** Commandes, les plus récentes d'abord ; filtrables par fournisseur et par statut. */
  get_commandes_fournisseur: async ({ fournisseurId, statut }) => {
    const toutes = await lister<CommandeFournisseur>(fournisseurId
      ? query(col("commandes_fournisseur"), where("fournisseur_id", "==", fournisseurId))
      : col("commandes_fournisseur"));
    return toutes.filter(c => !statut || c.statut === statut).sort(plusRecent);
  },

  /** Paiement au fournisseur et/ou casiers vides rendus en dehors d'une livraison. */
  regler_fournisseur: async ({ fournisseurId, montant, emballagesRendus, commentaire }) => {
    const m = Number(montant) || 0;
    if (m < 0) throw new Error("Le montant ne peut pas être négatif.");
    const rendus = entiers(emballagesRendus);
    if (m === 0 && Object.keys(rendus).length === 0) throw new Error("Indiquez un montant payé ou des casiers rendus.");
    const f = await lireFournisseur(fournisseurId as Id);
    const batch = writeBatch(db);
    mouvementCompte(batch, fournisseurId as Id, {
      type: "paiement", montant: -m,
      emballages: oppose(rendus),
      commentaire: String(commentaire ?? "").trim() || null,
    });
    await mouvementsVides(batch, oppose(rendus), { source: "règlement fournisseur", commentaire: f.nom });
    await ecrire(batch.commit());
  },

  get_receptions: async ({ fournisseurId }) =>
    (await lister<Reception>(fournisseurId
      ? query(col("receptions"), where("fournisseur_id", "==", fournisseurId))
      : col("receptions"))).sort(plusRecent),

  get_compte_fournisseur: async ({ fournisseurId }) => {
    const [f, operations, receptions, commandes] = await Promise.all([
      lireFournisseur(fournisseurId as Id),
      lister<OperationFournisseur>(query(col("operations_fournisseur"), where("fournisseur_id", "==", fournisseurId))),
      lister<Reception>(query(col("receptions"), where("fournisseur_id", "==", fournisseurId))),
      // Sans les commandes (règles pas encore à jour, hors ligne…), le compte reste consultable
      lister<CommandeFournisseur>(query(col("commandes_fournisseur"), where("fournisseur_id", "==", fournisseurId))).catch(() => [] as CommandeFournisseur[]),
    ]);
    return {
      fournisseur: f, operations: operations.sort(plusRecent), receptions: receptions.sort(plusRecent),
      commandes_en_attente: commandes.filter(c => c.statut === "envoyée").sort(plusRecent),
    };
  },

  /** Dernier prix d'achat payé à ce fournisseur pour chaque format (pré-remplissage). */
  get_derniers_prix_achat: async ({ fournisseurId }) => {
    const receptions = (await lister<Reception>(query(col("receptions"), where("fournisseur_id", "==", fournisseurId)))).sort(plusRecent);
    const prix: Record<Id, number> = {};
    for (const r of receptions) for (const l of r.lignes) if (prix[l.format_id] === undefined && l.prix_achat > 0) prix[l.format_id] = l.prix_achat;
    return prix;
  },
};
