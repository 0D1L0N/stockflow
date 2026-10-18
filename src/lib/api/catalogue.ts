import { doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Rayon } from "@/lib/familles";
import { col, ecrire, lister, maintenant, parNom, type Commande, type Id } from "./outils";
import { ajouterMouvement } from "./stock";
import { CASIER_PAR_VOLUME } from "./emballages";

export interface Produit { id: Id; nom: string; date_creation: string | null; rayon?: Rayon | null; }
export interface Format {
  id: Id; produit_id: Id; volume: number; unite: string;
  prix: number; stock: number; seuil_alerte: number;
  /** Type de casier consigné livré avec ce format (null : pas d'emballage à rendre) */
  emballage_id?: Id | null;
  /** Retiré du catalogue : déjà vendu, donc gardé pour l'historique mais plus proposé nulle part */
  archive?: boolean;
  /** Calculé à la lecture : bouteilles du casier s'il n'est pas l'habituel du volume (0,5 L en casier de 12) */
  casier?: number | null;
}

export const parVolume = (a: Format, b: Format) => a.volume - b.volume || (a.casier ?? 0) - (b.casier ?? 0);

export async function listerProduits(): Promise<Produit[]> {
  return (await lister<Produit>(col("produits"))).sort(parNom);
}

type EmballageNom = { id: Id; nom: string };
const listerNomsEmballages = () => lister<EmballageNom>(col("emballages")).catch(() => [] as EmballageNom[]);

/**
 * Bouteilles du casier quand le format n'est pas dans le casier habituel de son volume
 * (ex. Doppel noir 0,5 L en casier de 12 au lieu de 20), sinon null.
 */
function casierInhabituel(f: { volume: number; unite: string; emballage_id?: Id | null }, emballages: EmballageNom[]): number | null {
  const habituel = CASIER_PAR_VOLUME[f.volume];
  if (!f.emballage_id || f.unite === "pack" || f.unite === "canette" || !habituel || f.emballage_id === habituel) return null;
  const nom = emballages.find(e => e.id === f.emballage_id)?.nom ?? f.emballage_id;
  const n = parseInt(nom.match(/\d+/)?.[0] ?? "", 10);
  return n > 0 ? n : null;
}

/** Ajoute le champ casier à des formats lus directement. */
export async function avecCasier<T extends { volume: number; unite: string; emballage_id?: Id | null }>(formats: T[]): Promise<(T & { casier: number | null })[]> {
  const emballages = await listerNomsEmballages();
  return formats.map(f => ({ ...f, casier: casierInhabituel(f, emballages) }));
}

/** Formats du catalogue ; ceux retirés n'apparaissent qu'avec avecRetires. */
export async function listerFormats(produitId?: Id, avecRetires = false): Promise<Format[]> {
  const q = produitId ? query(col("formats"), where("produit_id", "==", produitId)) : col("formats");
  const formats = (await lister<Format>(q)).filter(f => avecRetires || !f.archive);
  return (await avecCasier(formats)).sort(parVolume);
}

/** Une vente existe-t-elle pour ce format ? (les ventes listent leurs format_ids) */
async function formatVendu(formatId: Id): Promise<boolean> {
  const snap = await getDocs(query(col("ventes"), where("format_ids", "array-contains", formatId), limit(1)));
  return !snap.empty;
}

/** Supprime les prix clients d'un format (Firestore n'a pas de suppression en cascade). */
async function supprimerPrixClientsDuFormat(formatId: Id, batch: ReturnType<typeof writeBatch>) {
  const [clients, groupes] = await Promise.all([
    getDocs(query(col("prix_clients"), where("format_id", "==", formatId))),
    getDocs(query(col("prix_groupes"), where("format_id", "==", formatId))),
  ]);
  [...clients.docs, ...groupes.docs].forEach(d => batch.delete(d.ref));
}

export const catalogue: Record<string, Commande> = {
  get_produits: async () => listerProduits(),

  get_produit: async ({ id }) => {
    const snap = await getDoc(doc(db, "produits", id as Id));
    if (!snap.exists()) throw new Error("Produit introuvable.");
    return { produit: { id: snap.id, ...snap.data() }, formats: await listerFormats(id as Id) };
  },

  create_produit: async ({ nom, rayon }) => {
    const ref = doc(col("produits"));
    await ecrire(setDoc(ref, { nom: String(nom).trim(), rayon: rayon || null, date_creation: maintenant() }));
    return ref.id;
  },

  update_produit: async ({ id, nom, rayon }) => {
    await ecrire(updateDoc(doc(db, "produits", id as Id), { nom: String(nom).trim(), rayon: rayon || null }));
  },

  delete_produit: async ({ id }) => {
    const formats = await listerFormats(id as Id, true);
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

  /**
   * Jamais vendu : supprimé. Déjà vendu : retiré du catalogue (les ventes et mouvements
   * gardent leur historique) ; un stock restant est remis à 0 avec un mouvement tracé.
   */
  delete_format: async ({ id }) => {
    const batch = writeBatch(db);
    await supprimerPrixClientsDuFormat(id as Id, batch);
    if (!(await formatVendu(id as Id))) {
      batch.delete(doc(db, "formats", id as Id));
      await ecrire(batch.commit());
      return { retire: false };
    }
    const snap = await getDoc(doc(db, "formats", id as Id));
    if (!snap.exists()) throw new Error("Format introuvable.");
    const format = { id: snap.id, ...snap.data() } as Format;
    const produit = await getDoc(doc(db, "produits", format.produit_id));
    const champs: Record<string, unknown> = { archive: true, date_retrait: maintenant() };
    if (format.stock !== 0) {
      champs.stock = 0;
      champs.dernier_mouvement = ajouterMouvement(batch, format, (produit.data()?.nom as string) ?? "—", {
        type: "ajustement", quantite: Math.abs(format.stock), stock_apres: 0, source: "inventaire",
        commentaire: "Format retiré du catalogue",
      });
    }
    batch.update(snap.ref, champs);
    await ecrire(batch.commit());
    return { retire: true };
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
