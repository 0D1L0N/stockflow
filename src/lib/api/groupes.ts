import { deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits } from "./catalogue";
import { FAMILLES, familleDe } from "@/lib/familles";

/**
 * Groupes de prix : une grille partagée par plusieurs clients.
 * Prix appliqué à une vente : prix propre du client, sinon prix du groupe, sinon prix comptoir.
 */
export interface GroupePrix { id: Id; nom: string; date_creation: string | null; }

export const idPrixGroupe = (groupeId: Id, formatId: Id) => `${groupeId}_${formatId}`;

/** Prix d'un groupe (format_id → prix). */
export async function prixDuGroupe(groupeId: Id | null | undefined): Promise<Map<Id, number>> {
  if (!groupeId) return new Map();
  const snap = await getDocs(query(col("prix_groupes"), where("groupe_id", "==", groupeId)));
  return new Map(snap.docs.map(d => [d.data().format_id as Id, d.data().prix as number]));
}

/**
 * Règle du prix comptoir (client standard) : prix d'un groupe de référence + un écart.
 * Ex. comptoir = GROUPE 2 + 200 F. Gardée dans parametres/general.regle_comptoir.
 */
export interface RegleComptoir { groupe_id: Id; ecart: number }

export async function lireRegleComptoir(): Promise<RegleComptoir | null> {
  const r = (await getDoc(doc(db, "parametres", "general"))).data()?.regle_comptoir as RegleComptoir | undefined;
  return r?.groupe_id ? { groupe_id: r.groupe_id, ecart: Number(r.ecart) || 0 } : null;
}

/**
 * Aligne les prix comptoir sur le groupe de référence (tous les formats, ou seulement ceux indiqués).
 * Un format sans prix dans ce groupe garde son prix comptoir. Renvoie les prix changés.
 */
export async function appliquerRegleComptoir(regle: RegleComptoir, formatIds?: Id[]) {
  const [formats, prix, produits] = await Promise.all([listerFormats(), prixDuGroupe(regle.groupe_id), listerProduits()]);
  const noms = new Map(produits.map(p => [p.id, p.nom]));
  const changes: { format_id: Id; produit_nom: string; volume: number; unite: string; ancien: number; nouveau: number }[] = [];
  for (const f of formats) {
    if (formatIds && !formatIds.includes(f.id)) continue;
    const p = prix.get(f.id);
    if (p === undefined) continue;
    const nouveau = p + regle.ecart;
    if (nouveau > 0 && nouveau !== f.prix) changes.push({ format_id: f.id, produit_nom: noms.get(f.produit_id) ?? "?", volume: f.volume, unite: f.unite, ancien: f.prix, nouveau });
  }
  for (let i = 0; i < changes.length; i += 450) {
    const batch = writeBatch(db);
    for (const c of changes.slice(i, i + 450)) batch.update(doc(db, "formats", c.format_id), { prix: c.nouveau });
    await ecrire(batch.commit());
  }
  return changes;
}

export const groupes: Record<string, Commande> = {
  get_regle_comptoir: async () => lireRegleComptoir(),

  /** groupeId vide : plus de règle. Sinon enregistre la règle et l'applique tout de suite. */
  set_regle_comptoir: async ({ groupeId, ecart }) => {
    if (!groupeId) {
      await ecrire(setDoc(doc(db, "parametres", "general"), { regle_comptoir: deleteField() }, { merge: true }));
      return [];
    }
    const e = Math.round(Number(ecart));
    if (!Number.isFinite(e)) throw new Error("Indiquez l'écart en francs (ex. : 200).");
    const regle = { groupe_id: groupeId as Id, ecart: e };
    await ecrire(setDoc(doc(db, "parametres", "general"), { regle_comptoir: regle }, { merge: true }));
    return appliquerRegleComptoir(regle);
  },

  get_groupes_prix: async () => {
    const [liste, clients, prix] = await Promise.all([
      lister<GroupePrix>(col("groupes_prix")),
      lister<{ id: Id; groupe_prix_id?: Id | null }>(col("clients")),
      lister<{ groupe_id: Id }>(col("prix_groupes")),
    ]);
    return liste.sort(parNom).map(g => ({
      ...g,
      nb_clients: clients.filter(c => c.groupe_prix_id === g.id).length,
      nb_prix: prix.filter(p => p.groupe_id === g.id).length,
    }));
  },

  create_groupe_prix: async ({ nom }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez un nom au groupe.");
    const ref = doc(col("groupes_prix"));
    await ecrire(setDoc(ref, { nom: n, date_creation: maintenant() }));
    return ref.id;
  },

  update_groupe_prix: async ({ id, nom }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez un nom au groupe.");
    await ecrire(updateDoc(doc(db, "groupes_prix", id as Id), { nom: n }));
  },

  /** Supprime le groupe et sa grille ; ses clients repassent à leurs prix propres ou au prix comptoir. */
  delete_groupe_prix: async ({ id }) => {
    if ((await lireRegleComptoir())?.groupe_id === id) {
      await ecrire(setDoc(doc(db, "parametres", "general"), { regle_comptoir: deleteField() }, { merge: true }));
    }
    const [clients, prix] = await Promise.all([
      getDocs(query(col("clients"), where("groupe_prix_id", "==", id))),
      getDocs(query(col("prix_groupes"), where("groupe_id", "==", id))),
    ]);
    const refs = [
      ...clients.docs.map(d => ({ ref: d.ref, maj: true })),
      ...prix.docs.map(d => ({ ref: d.ref, maj: false })),
    ];
    for (let i = 0; i < refs.length; i += 450) {
      const batch = writeBatch(db);
      refs.slice(i, i + 450).forEach(r => r.maj ? batch.update(r.ref, { groupe_prix_id: null }) : batch.delete(r.ref));
      await ecrire(batch.commit());
    }
    await ecrire(deleteDoc(doc(db, "groupes_prix", id as Id)));
  },

  /** Tous les formats avec le prix du groupe (même forme que get_prix_client, pour le même écran). */
  get_prix_groupe: async ({ groupeId }) => {
    const [produits, formats, prix] = await Promise.all([listerProduits(), listerFormats(), prixDuGroupe(groupeId as Id)]);
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const rayons = new Map(produits.map(p => [p.id, p.rayon ?? null]));
    const ordre = (cle: string) => FAMILLES.findIndex(f => f.cle === cle);
    return formats
      .map(f => ({
        famille: familleDe(f.emballage_id, rayons.get(f.produit_id)),
        format_id: f.id, produit_id: f.produit_id, produit_nom: noms.get(f.produit_id) ?? "?",
        volume: f.volume, unite: f.unite, prix_base: f.prix,
        prix_groupe: null, groupe_nom: null,
        prix_client: prix.get(f.id) ?? null, date_maj: null,
      }))
      .sort((a, b) => ordre(a.famille) - ordre(b.famille) || a.produit_nom.localeCompare(b.produit_nom, "fr") || a.volume - b.volume);
  },

  set_prix_groupe: async ({ groupeId, formatId, prix }) => {
    const p = Number(prix);
    if (!(p > 0)) throw new Error("Le prix doit être supérieur à 0.");
    await ecrire(setDoc(doc(db, "prix_groupes", idPrixGroupe(groupeId as Id, formatId as Id)), {
      groupe_id: groupeId, format_id: formatId, prix: p, date_maj: maintenant(),
    }));
    // Groupe de référence du comptoir : le prix comptoir suit
    const regle = await lireRegleComptoir();
    if (regle && regle.groupe_id === groupeId) await appliquerRegleComptoir(regle, [formatId as Id]);
  },

  delete_prix_groupe: async ({ groupeId, formatId }) => {
    await ecrire(deleteDoc(doc(db, "prix_groupes", idPrixGroupe(groupeId as Id, formatId as Id))));
  },

  /**
   * Crée un groupe avec les prix propres d'un client, puis y range le client :
   * ses prix deviennent ceux du groupe (il n'en garde aucun en propre).
   */
  creer_groupe_depuis_client: async ({ clientId, nom }) => {
    const n = String(nom ?? "").trim();
    if (!n) throw new Error("Donnez un nom au groupe.");
    const prix = await getDocs(query(col("prix_clients"), where("client_id", "==", clientId)));
    if (prix.empty) throw new Error("Ce client n'a pas encore de prix à reprendre.");
    const groupe = doc(col("groupes_prix"));
    const batch = writeBatch(db);
    batch.set(groupe, { nom: n, date_creation: maintenant() });
    prix.docs.forEach(d => {
      const { format_id, prix: p } = d.data();
      batch.set(doc(db, "prix_groupes", idPrixGroupe(groupe.id, format_id)), { groupe_id: groupe.id, format_id, prix: p, date_maj: maintenant() });
      batch.delete(d.ref);
    });
    batch.update(doc(db, "clients", clientId as Id), { groupe_prix_id: groupe.id });
    await ecrire(batch.commit());
    return groupe.id;
  },

  /** Efface les prix propres d'un client : il suit entièrement son groupe (ou le prix comptoir). */
  vider_prix_client: async ({ clientId }) => {
    const prix = await getDocs(query(col("prix_clients"), where("client_id", "==", clientId)));
    const batch = writeBatch(db);
    prix.docs.forEach(d => batch.delete(d.ref));
    await ecrire(batch.commit());
    return prix.size;
  },

  /** Range un client dans un groupe (null : aucun groupe). */
  set_groupe_client: async ({ clientId, groupeId }) => {
    await ecrire(updateDoc(doc(db, "clients", clientId as Id), { groupe_prix_id: groupeId || null }));
  },
};
