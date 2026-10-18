import { doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";

export interface Produit { id: Id; nom: string; date_creation: string | null; }
export interface Format {
  id: Id; produit_id: Id; volume: number; unite: string;
  prix: number; stock: number; seuil_alerte: number;
  /** Type de casier consigné livré avec ce format (null : pas d'emballage à rendre) */
  emballage_id?: Id | null;
}

export const parVolume = (a: Format, b: Format) => a.volume - b.volume;

export async function listerProduits(): Promise<Produit[]> {
  return (await lister<Produit>(col("produits"))).sort(parNom);
}

export async function listerFormats(produitId?: Id): Promise<Format[]> {
  const q = produitId ? query(col("formats"), where("produit_id", "==", produitId)) : col("formats");
  return (await lister<Format>(q)).sort(parVolume);
}

/** Une vente existe-t-elle pour ce format ? (les ventes listent leurs format_ids) */
async function formatVendu(formatId: Id): Promise<boolean> {
  const snap = await getDocs(query(col("ventes"), where("format_ids", "array-contains", formatId), limit(1)));
  return !snap.empty;
}

/** Supprime les prix clients d'un format (Firestore n'a pas de suppression en cascade). */
async function supprimerPrixClientsDuFormat(formatId: Id, batch: ReturnType<typeof writeBatch>) {
  const snap = await getDocs(query(col("prix_clients"), where("format_id", "==", formatId)));
  snap.docs.forEach(d => batch.delete(d.ref));
}

export const catalogue: Record<string, Commande> = {
  get_produits: async () => listerProduits(),

  get_produit: async ({ id }) => {
    const snap = await getDoc(doc(db, "produits", id as Id));
    if (!snap.exists()) throw new Error("Produit introuvable.");
    return { produit: { id: snap.id, ...snap.data() }, formats: await listerFormats(id as Id) };
  },

  create_produit: async ({ nom }) => {
    const ref = doc(col("produits"));
    await ecrire(setDoc(ref, { nom: String(nom).trim(), date_creation: maintenant() }));
    return ref.id;
  },

  update_produit: async ({ id, nom }) => {
    await ecrire(updateDoc(doc(db, "produits", id as Id), { nom: String(nom).trim() }));
  },

  delete_produit: async ({ id }) => {
    const formats = await listerFormats(id as Id);
    if (formats.some(f => f.stock > 0)) throw new Error("Impossible de supprimer : ce produit a encore du stock.");
    for (const f of formats) {
      if (await formatVendu(f.id)) throw new Error("Impossible de supprimer : des ventes existent pour ce produit.");
    }
    const batch = writeBatch(db);
    for (const f of formats) {
      await supprimerPrixClientsDuFormat(f.id, batch);
      batch.delete(doc(db, "formats", f.id));
    }
    batch.delete(doc(db, "produits", id as Id));
    await ecrire(batch.commit());
  },

  get_formats_by_produit: async ({ produitId }) => listerFormats(produitId as Id),

  create_format: async ({ produitId, volume, unite, prix, stock, seuilAlerte, emballageId }) => {
    const v = Number(volume), p = Number(prix), s = Number(stock), seuil = Number(seuilAlerte);
    if (!(v > 0)) throw new Error("Le volume doit être supérieur à 0.");
    if (!(p > 0)) throw new Error("Le prix doit être supérieur à 0.");
    if (!(s >= 0) || !(seuil >= 0)) throw new Error("Stock et seuil doivent être positifs.");
    const ref = doc(col("formats"));
    await ecrire(setDoc(ref, {
      produit_id: produitId, volume: v, unite: String(unite), prix: p, stock: Math.trunc(s), seuil_alerte: Math.trunc(seuil),
      emballage_id: emballageId || null,
    }));
    return ref.id;
  },

  update_format: async ({ id, prix, seuilAlerte, emballageId }) => {
    const p = Number(prix), seuil = Number(seuilAlerte);
    if (!(p > 0)) throw new Error("Le prix doit être supérieur à 0.");
    if (!(seuil >= 0)) throw new Error("Le seuil doit être positif.");
    await ecrire(updateDoc(doc(db, "formats", id as Id), {
      prix: p, seuil_alerte: Math.trunc(seuil), emballage_id: emballageId || null,
    }));
  },

  delete_format: async ({ id }) => {
    if (await formatVendu(id as Id)) throw new Error("Impossible de supprimer : ce format a des ventes associées.");
    const batch = writeBatch(db);
    await supprimerPrixClientsDuFormat(id as Id, batch);
    batch.delete(doc(db, "formats", id as Id));
    await ecrire(batch.commit());
  },

  get_formats_en_alerte: async () => {
    const [produits, formats] = await Promise.all([listerProduits(), listerFormats()]);
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    return formats
      .filter(f => f.stock <= f.seuil_alerte)
      .map(f => ({
        ...f,
        produit_nom: noms.get(f.produit_id) ?? "?",
        en_alerte: 1,
        quantite_manquante: Math.max(0, f.seuil_alerte - f.stock),
      }))
      .sort((a, b) => a.stock - b.stock);
  },
};
