import { doc, getDoc, increment, query, serverTimestamp, where, writeBatch, type DocumentData, type DocumentReference, type WriteBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import { nombreFr } from "@/lib/format";

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
    await ecrire(batch.commit());
    return soldes;
  },

  /** Journal des opérations d'un client, de la plus récente à la plus ancienne. */
  get_operations_client: async ({ clientId }) =>
    (await lister<Operation>(query(col("operations_client"), where("client_id", "==", clientId))))
      .sort((a, b) => b.date.localeCompare(a.date)),
};
