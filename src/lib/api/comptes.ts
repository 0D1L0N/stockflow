import { doc, getDoc, increment, query, serverTimestamp, where, writeBatch, type DocumentData, type DocumentReference, type WriteBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import { nombreFr } from "@/lib/format";
import { mouvementsVides } from "./casiers";

/** Ce qu'un client doit : de l'argent et des casiers (par type d'emballage). */
export interface SoldesClient { solde_argent: number; emballages_dus: Record<string, number>; }

interface Operation {
  id: Id; client_id: Id; type: "vente" | "paiement" | "retour_emballages" | "annulation";
  montant: number; emballages: Record<string, number>; date: string;
}

/**
 * Ajoute au batch la variation des soldes d'un client (dette d'argent et casiers dus).
 * Toujours par increment : deux appareils hors ligne ne s'écrasent pas.
 * `operationId` : l'entrée du journal créée dans le même batch (exigée par les règles).
 * Renvoie les soldes estimés après l'opération (d'après la dernière valeur connue).
 */
export function appliquerAuCompte(
  batch: WriteBatch, clientId: Id, clientData: DocumentData,
  montant: number, emballages: Record<string, number>, operationId: Id,
): SoldesClient {
  const variations: Record<string, unknown> = {};
  for (const [e, d] of Object.entries(emballages)) if (d !== 0) variations[e] = increment(d);
  if (montant !== 0 || Object.keys(variations).length > 0) {
    batch.set(doc(db, "clients", clientId), {
      ...(montant !== 0 ? { solde_argent: increment(montant) } : {}),
      ...(Object.keys(variations).length ? { emballages_dus: variations } : {}),
      derniere_operation: operationId,
    }, { merge: true });
  }
  const dus: Record<string, number> = { ...(clientData.emballages_dus ?? {}) };
  for (const [e, d] of Object.entries(emballages)) dus[e] = (dus[e] ?? 0) + d;
  for (const e of Object.keys(dus)) if (dus[e] === 0) delete dus[e];
  return { solde_argent: ((clientData.solde_argent as number) ?? 0) + montant, emballages_dus: dus };
}

async function lireClient(clientId: Id) {
  const snap = await getDoc(doc(db, "clients", clientId));
  if (!snap.exists()) throw new Error("Client introuvable.");
  return snap.data();
}

/** Nouvelle entrée du journal (référence créée d'avance pour la lier au solde). */
export const nouvelleOperation = () => doc(col("operations_client"));

function trace(batch: WriteBatch, ref: DocumentReference, clientId: Id, clientNom: string, champs: Record<string, unknown>) {
  batch.set(ref, {
    client_id: clientId, client_nom: clientNom, vente_id: null, numero_facture: null,
    commentaire: null, date: maintenant(), cree_le: serverTimestamp(),
    utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: useAuthStore.getState().profil?.nom ?? "",
    ...champs,
  });
}

export const comptes: Record<string, Commande> = {
  /** Le client règle tout ou partie de sa dette. */
  encaisser_paiement: async ({ clientId, montant, commentaire }) => {
    const m = Number(montant);
    if (!(m > 0)) throw new Error("Le montant doit être supérieur à 0.");
    const client = await lireClient(clientId as Id);
    const du = (client.solde_argent as number) ?? 0;
    if (m > du) throw new Error(`Le client ne doit que ${nombreFr(du)}.`);
    const batch = writeBatch(db);
    const op = nouvelleOperation();
    const soldes = appliquerAuCompte(batch, clientId as Id, client, -m, {}, op.id);
    trace(batch, op, clientId as Id, client.nom, { type: "paiement", montant: -m, emballages: {}, commentaire: commentaire || null });
    await ecrire(batch.commit());
    return soldes;
  },

  /**
   * Règlement d'une facture après coup : l'argent et/ou les casiers que le client remet plus tard,
   * rattachés à cette vente (la vente garde ce qui a été réglé depuis : regle_apres, rendus_apres).
   */
  regler_vente: async ({ venteId, montant, emballages, commentaire }) => {
    const venteRef = doc(db, "ventes", venteId as Id);
    const vSnap = await getDoc(venteRef);
    if (!vSnap.exists()) throw new Error("Vente introuvable.");
    const v = vSnap.data();
    if (v.statut === "annulée") throw new Error("Cette vente est annulée.");
    if (v.livraison?.statut === "en_cours") throw new Error("Cette vente est en livraison : notez le retour du livreur dans Livraisons.");
    const client = await lireClient(v.client_id as Id);
    if (client.est_defaut === 1) throw new Error("Vente au comptoir : rien à régler sur un compte.");

    const m = Math.trunc(Number(montant) || 0);
    if (m < 0) throw new Error("Le montant ne peut pas être négatif.");
    const resteVente = Math.max(0, ((v.reste_du as number) ?? 0) - ((v.regle_apres as number) ?? 0));
    if (m > resteVente) throw new Error(`Il ne reste que ${nombreFr(resteVente)} à payer sur cette facture.`);

    const livres = (v.emballages_livres ?? {}) as Record<string, number>;
    const rendus = (v.emballages_rendus ?? {}) as Record<string, number>;
    const rendusApres = (v.rendus_apres ?? {}) as Record<string, number>;
    const retour: Record<string, number> = {};
    for (const [e, n] of Object.entries((emballages ?? {}) as Record<string, number>)) {
      const q = Math.trunc(Number(n) || 0);
      if (q < 0) throw new Error("Quantité de casiers invalide.");
      const dus = Math.max(0, (livres[e] ?? 0) - (rendus[e] ?? 0) - (rendusApres[e] ?? 0));
      if (q > dus) throw new Error("Plus de casiers rendus que ceux dus sur cette facture.");
      if (q > 0) retour[e] = q;
    }
    if (m === 0 && Object.keys(retour).length === 0) throw new Error("Indiquez un montant ou des casiers rendus.");

    const batch = writeBatch(db);
    const op = nouvelleOperation();
    const variation = Object.fromEntries(Object.entries(retour).map(([e, q]) => [e, -q]));
    const soldes = appliquerAuCompte(batch, v.client_id as Id, client, -m, variation, op.id);
    trace(batch, op, v.client_id as Id, client.nom, {
      type: m > 0 ? "paiement" : "retour_emballages", montant: -m, emballages: variation,
      vente_id: venteId, numero_facture: v.numero_facture, commentaire: String(commentaire ?? "").trim() || null,
    });
    batch.update(venteRef, {
      regle_apres: increment(m),
      ...Object.fromEntries(Object.entries(retour).map(([e, q]) => [`rendus_apres.${e}`, increment(q)])),
      dernier_reglement: op.id,
    });
    await mouvementsVides(batch, retour, { source: "retour client", reference_id: op.id, commentaire: `${client.nom} · ${v.numero_facture}` });
    await ecrire(batch.commit());
    return soldes;
  },

  /**
   * Retour du livreur : ce que le client a remis à la livraison (argent, casiers vides).
   * Tout le monde peut le noter. L'argent couvre d'abord la facture, le surplus l'ancienne dette ;
   * les casiers d'abord ceux de la facture, le surplus les anciens casiers dus. Clôt la livraison.
   */
  cloturer_livraison: async ({ venteId, montant, emballages, commentaire }) => {
    const venteRef = doc(db, "ventes", venteId as Id);
    const vSnap = await getDoc(venteRef);
    if (!vSnap.exists()) throw new Error("Vente introuvable.");
    const v = vSnap.data();
    if (v.statut === "annulée") throw new Error("Cette vente est annulée.");
    if (v.livraison?.statut !== "en_cours") throw new Error("Cette livraison est déjà clôturée.");
    const client = await lireClient(v.client_id as Id);

    const m = Math.trunc(Number(montant) || 0);
    if (m < 0) throw new Error("Le montant ne peut pas être négatif.");
    const resteVente = Math.max(0, ((v.reste_du as number) ?? 0) - ((v.regle_apres as number) ?? 0));
    const detteTotale = Math.max(resteVente, (client.solde_argent as number) ?? 0);
    if (m > detteTotale) throw new Error(`${client.nom} ne doit que ${nombreFr(detteTotale)} en tout.`);

    const livres = (v.emballages_livres ?? {}) as Record<string, number>;
    const rendus = (v.emballages_rendus ?? {}) as Record<string, number>;
    const rendusApres = (v.rendus_apres ?? {}) as Record<string, number>;
    const dusCompte = (client.emballages_dus ?? {}) as Record<string, number>;
    const retour: Record<string, number> = {}, surFacture: Record<string, number> = {};
    for (const [e, n] of Object.entries((emballages ?? {}) as Record<string, number>)) {
      const q = Math.trunc(Number(n) || 0);
      if (q < 0) throw new Error("Quantité de casiers invalide.");
      const dusFacture = Math.max(0, (livres[e] ?? 0) - (rendus[e] ?? 0) - (rendusApres[e] ?? 0));
      if (q > Math.max(dusFacture, dusCompte[e] ?? 0)) throw new Error("Plus de casiers rendus que ceux que le client doit.");
      if (q > 0) { retour[e] = q; surFacture[e] = Math.min(q, dusFacture); }
    }

    const batch = writeBatch(db);
    const op = nouvelleOperation();
    const variation = Object.fromEntries(Object.entries(retour).map(([e, q]) => [e, -q]));
    const soldes = appliquerAuCompte(batch, v.client_id as Id, client, -m, variation, op.id);
    const livreurs = (v.livraison?.livreurs ?? []) as string[];
    trace(batch, op, v.client_id as Id, client.nom, {
      type: m > 0 || Object.keys(retour).length === 0 ? "paiement" : "retour_emballages", montant: -m, emballages: variation,
      vente_id: venteId, numero_facture: v.numero_facture, livraison: true,
      commentaire: [`Retour de livraison (${livreurs.join(", ")})`, String(commentaire ?? "").trim()].filter(Boolean).join(" · "),
    });
    batch.update(venteRef, {
      regle_apres: increment(Math.min(m, resteVente)),
      ...Object.fromEntries(Object.entries(surFacture).filter(([, q]) => q > 0).map(([e, q]) => [`rendus_apres.${e}`, increment(q)])),
      dernier_reglement: op.id,
      "livraison.statut": "livrée",
      "livraison.date_cloture": maintenant(),
      "livraison.cloture_par": useAuthStore.getState().profil?.nom ?? "",
      "livraison.recu": m,
      "livraison.casiers_rendus": retour,
    });
    await mouvementsVides(batch, retour, { source: "retour client", reference_id: op.id, commentaire: `${client.nom} · ${v.numero_facture} (livraison)` });
    await ecrire(batch.commit());
    return soldes;
  },

  /** Le client rapporte des casiers vides en dehors d'une vente. */
  retour_emballages: async ({ clientId, emballages, commentaire }) => {
    const client = await lireClient(clientId as Id);
    const dus = (client.emballages_dus ?? {}) as Record<string, number>;
    const retour: Record<string, number> = {};
    for (const [e, n] of Object.entries((emballages ?? {}) as Record<string, number>)) {
      const q = Math.trunc(Number(n));
      if (q < 0) throw new Error("Quantité invalide.");
      if (q > (dus[e] ?? 0)) throw new Error("Le client rend plus de casiers qu'il n'en doit.");
      if (q > 0) retour[e] = -q;
    }
    if (Object.keys(retour).length === 0) throw new Error("Indiquez au moins un casier rendu.");
    const batch = writeBatch(db);
    const op = nouvelleOperation();
    const soldes = appliquerAuCompte(batch, clientId as Id, client, 0, retour, op.id);
    trace(batch, op, clientId as Id, client.nom, { type: "retour_emballages", montant: 0, emballages: retour, commentaire: commentaire || null });
    // Les vides rapportés rentrent au magasin
    await mouvementsVides(batch, Object.fromEntries(Object.entries(retour).map(([e, n]) => [e, -n])),
      { source: "retour client", reference_id: op.id, commentaire: String(client.nom ?? "") || null });
    await ecrire(batch.commit());
    return soldes;
  },

  /** Journal des opérations d'un client, de la plus récente à la plus ancienne. */
  get_operations_client: async ({ clientId }) =>
    (await lister<Operation>(query(col("operations_client"), where("client_id", "==", clientId))))
      .sort((a, b) => b.date.localeCompare(a.date)),
};
