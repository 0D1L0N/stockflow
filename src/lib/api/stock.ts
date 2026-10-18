import { doc, getDoc, increment, limit, orderBy, query, where, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import type { Format } from "./catalogue";

interface Mouvement {
  id: Id; format_id: Id; produit_nom: string | null; volume: number | null; unite: string | null;
  type: string; quantite: number; stock_avant: number; stock_apres: number;
  source: string; commentaire: string | null; date: string | null;
}

/** Format + nom du produit, lus depuis le cache local si hors ligne. */
async function lireFormat(formatId: Id) {
  const snap = await getDoc(doc(db, "formats", formatId));
  if (!snap.exists()) throw new Error("Format introuvable");
  const format = { id: snap.id, ...snap.data() } as Format;
  const produit = await getDoc(doc(db, "produits", format.produit_id));
  return { format, produitNom: (produit.data()?.nom as string) ?? "—" };
}

/** Enregistre un mouvement de stock dans le même batch que la mise à jour du format. */
function ajouterMouvement(
  batch: ReturnType<typeof writeBatch>,
  format: Format, produitNom: string,
  m: { type: string; quantite: number; stock_apres: number; source: string; commentaire: unknown },
) {
  batch.set(doc(col("mouvements_stock")), {
    format_id: format.id,
    produit_nom: produitNom,
    volume: format.volume,
    unite: format.unite,
    type: m.type,
    quantite: m.quantite,
    stock_avant: format.stock,
    stock_apres: m.stock_apres,
    source: m.source,
    reference_id: null,
    commentaire: (m.commentaire as string | null) ?? null,
    utilisateur_uid: auth.currentUser?.uid,
    date: maintenant(),
  });
}

export const stock: Record<string, Commande> = {
  reapprovisionner: async ({ formatId, quantite, commentaire }) => {
    const q = Math.trunc(Number(quantite));
    if (!(q > 0)) throw new Error("La quantité doit être positive.");
    const { format, produitNom } = await lireFormat(formatId as Id);
    const batch = writeBatch(db);
    // increment : ne perd pas une vente faite au même moment sur un autre appareil
    batch.update(doc(db, "formats", format.id), { stock: increment(q) });
    ajouterMouvement(batch, format, produitNom, {
      type: "entrée", quantite: q, stock_apres: format.stock + q, source: "réapprovisionnement", commentaire,
    });
    await ecrire(batch.commit());
  },

  /** Inventaire : le stock compté remplace la valeur enregistrée. */
  ajuster_stock: async ({ formatId, nouveauStock, commentaire }) => {
    const ns = Math.trunc(Number(nouveauStock));
    if (!(ns >= 0)) throw new Error("Le stock ne peut pas être négatif.");
    const { format, produitNom } = await lireFormat(formatId as Id);
    const batch = writeBatch(db);
    batch.update(doc(db, "formats", format.id), { stock: ns });
    ajouterMouvement(batch, format, produitNom, {
      type: "ajustement", quantite: Math.abs(ns - format.stock), stock_apres: ns, source: "inventaire", commentaire,
    });
    await ecrire(batch.commit());
  },

  /**
   * Historique des mouvements, du plus récent au plus ancien (500 max).
   * Les requêtes n'utilisent qu'un seul champ filtré pour éviter d'avoir
   * à créer des index composites ; le reste est filtré ici.
   */
  get_mouvements_stock: async ({ formatId, dateDebut, dateFin, typeMouvement }) => {
    const debut = (dateDebut as string | null) || "2000-01-01";
    const fin = `${(dateFin as string | null) || "2099-12-31"} 23:59:59`;

    const mouvements = formatId
      ? await lister<Mouvement>(query(col("mouvements_stock"), where("format_id", "==", formatId)))
      : await lister<Mouvement>(query(col("mouvements_stock"),
          where("date", ">=", debut), where("date", "<=", fin), orderBy("date", "desc"), limit(500)));

    return mouvements
      .filter(m => (m.date ?? "") >= debut && (m.date ?? "") <= fin)
      .filter(m => !typeMouvement || m.type === typeMouvement)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 500);
  },
};
