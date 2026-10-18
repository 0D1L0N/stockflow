import { deleteDoc, doc, getDoc, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits, type Format } from "./catalogue";
import { ajouterMouvement } from "./stock";

/**
 * Fournisseurs, réceptions de marchandises et compte fournisseur.
 * solde_argent : ce que le dépôt doit au fournisseur.
 * emballages_dus : casiers que le dépôt doit rendre au fournisseur (négatif : le fournisseur nous en doit).
 */
export interface Fournisseur {
  id: Id; nom: string; telephone: string | null; adresse: string | null;
  solde_argent?: number; emballages_dus?: Record<string, number>; date_creation: string | null;
}

export interface LigneReception {
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
    await ecrire(setDoc(ref, { nom: n, telephone: telephone || null, adresse: adresse || null, date_creation: maintenant() }));
    return ref.id;
  },

  update_fournisseur: async ({ id, nom, telephone, adresse }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez le nom du fournisseur.");
    await ecrire(updateDoc(doc(db, "fournisseurs", id as Id), { nom: n, telephone: telephone || null, adresse: adresse || null }));
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
  creer_reception: async ({ fournisseurId, numeroBl, lignes, montantPaye, emballagesRendus, commentaire }) => {
    const f = await lireFournisseur(fournisseurId as Id);
    const [formats, produits] = await Promise.all([listerFormats(), listerProduits()]);
    const parId = new Map(formats.map(x => [x.id, x]));
    const noms = new Map(produits.map(p => [p.id, p.nom]));

    // Lignes valides, un même format regroupé
    const cumul = new Map<Id, { quantite: number; prix: number }>();
    for (const l of (lignes ?? []) as { formatId: Id; quantite: unknown; prixAchat: unknown }[]) {
      const q = Math.trunc(Number(l.quantite)), p = Number(l.prixAchat) || 0;
      if (!(q > 0)) continue;
      if (p < 0) throw new Error("Un prix d'achat ne peut pas être négatif.");
      if (!parId.has(l.formatId)) throw new Error("Un produit de la réception n'existe plus.");
      const c = cumul.get(l.formatId);
      cumul.set(l.formatId, { quantite: (c?.quantite ?? 0) + q, prix: p || c?.prix || 0 });
    }
    if (cumul.size === 0) throw new Error("Ajoutez au moins un produit reçu.");

    const lignesFinales: LigneReception[] = [...cumul].map(([id, { quantite, prix }]) => {
      const fm = parId.get(id) as Format;
      return { format_id: id, produit_nom: noms.get(fm.produit_id) ?? "?", volume: fm.volume, unite: fm.unite,
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
        type: "entrée", quantite: l.quantite, stock_apres: fm.stock + l.quantite, source: "réception fournisseur",
        commentaire: `${f.nom}${bl ? ` · BL ${bl}` : ""} · ${numero}`, reference_id: recRef.id,
      });
      // Le format cite la réception (les règles vérifient qu'il y figure)
      batch.update(doc(db, "formats", fm.id), { stock: increment(l.quantite), derniere_reception: recRef.id });
    }
    mouvementCompte(batch, f.id, { type: "réception", montant: total - paye, emballages: delta, reception_id: recRef.id, numero });
    await ecrire(batch.commit());
    return { id: recRef.id, numero, total, reste_du: total - paye };
  },

  /** Paiement au fournisseur et/ou casiers vides rendus en dehors d'une livraison. */
  regler_fournisseur: async ({ fournisseurId, montant, emballagesRendus, commentaire }) => {
    const m = Number(montant) || 0;
    if (m < 0) throw new Error("Le montant ne peut pas être négatif.");
    const rendus = entiers(emballagesRendus);
    if (m === 0 && Object.keys(rendus).length === 0) throw new Error("Indiquez un montant payé ou des casiers rendus.");
    await lireFournisseur(fournisseurId as Id);
    const batch = writeBatch(db);
    mouvementCompte(batch, fournisseurId as Id, {
      type: "paiement", montant: -m,
      emballages: Object.fromEntries(Object.entries(rendus).map(([k, n]) => [k, -n])),
      commentaire: String(commentaire ?? "").trim() || null,
    });
    await ecrire(batch.commit());
  },

  get_receptions: async ({ fournisseurId }) =>
    (await lister<Reception>(fournisseurId
      ? query(col("receptions"), where("fournisseur_id", "==", fournisseurId))
      : col("receptions"))).sort(plusRecent),

  get_compte_fournisseur: async ({ fournisseurId }) => {
    const [f, operations, receptions] = await Promise.all([
      lireFournisseur(fournisseurId as Id),
      lister<OperationFournisseur>(query(col("operations_fournisseur"), where("fournisseur_id", "==", fournisseurId))),
      lister<Reception>(query(col("receptions"), where("fournisseur_id", "==", fournisseurId))),
    ]);
    return { fournisseur: f, operations: operations.sort(plusRecent), receptions: receptions.sort(plusRecent) };
  },

  /** Dernier prix d'achat payé à ce fournisseur pour chaque format (pré-remplissage). */
  get_derniers_prix_achat: async ({ fournisseurId }) => {
    const receptions = (await lister<Reception>(query(col("receptions"), where("fournisseur_id", "==", fournisseurId)))).sort(plusRecent);
    const prix: Record<Id, number> = {};
    for (const r of receptions) for (const l of r.lignes) if (prix[l.format_id] === undefined && l.prix_achat > 0) prix[l.format_id] = l.prix_achat;
    return prix;
  },
};
