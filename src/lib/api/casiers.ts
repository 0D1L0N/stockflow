import { doc, getDoc, increment, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, maintenant, type Commande, type Id } from "./outils";
import { listerFormats, listerProduits, type Format } from "./catalogue";
import { listerEmballages } from "./emballages";
import { ajouterMouvement } from "./stock";

/**
 * Casiers vides au magasin (champ stock_vides de chaque type d'emballage).
 * Les casiers pleins sont le stock des formats ; les vides changent quand un client
 * en rapporte, quand on en rend au fournisseur, à la casse et au comptage.
 * Chaque variation est tracée dans mouvements_vides, que l'emballage cite (exigé par les règles).
 */
export type SourceVides = "vente" | "annulation" | "retour client" | "réception fournisseur" | "règlement fournisseur" | "inventaire" | "cassé";

export interface MouvementVides {
  id: Id; emballage_id: Id; variation: number; stock_avant: number; stock_apres: number;
  source: SourceVides; reference_id: Id | null; commentaire: string | null;
  date: string; utilisateur_nom: string;
}

/** Ajoute (variation > 0) ou retire des casiers vides du magasin, dans le batch donné. */
export function mouvementVides(
  batch: ReturnType<typeof writeBatch>, emballageId: Id, variation: number, stockAvant: number,
  m: { source: SourceVides; reference_id?: Id | null; commentaire?: string | null; comptage?: boolean },
) {
  if (variation === 0) return;
  const ref = doc(col("mouvements_vides"));
  const date = maintenant();
  batch.set(ref, {
    emballage_id: emballageId, variation, stock_avant: stockAvant, stock_apres: stockAvant + variation,
    source: m.source, reference_id: m.reference_id ?? null, commentaire: m.commentaire ?? null,
    date, cree_le: serverTimestamp(),
    utilisateur_uid: auth.currentUser?.uid, utilisateur_nom: useAuthStore.getState().profil?.nom ?? "",
  });
  // increment : une vente faite au même moment sur un autre appareil ne se perd pas
  batch.set(doc(db, "emballages", emballageId), {
    stock_vides: increment(variation), dernier_mouvement_vides: ref.id,
    ...(m.comptage ? { dernier_comptage: date } : {}),
  }, { merge: true });
}

/** Vides actuellement connus pour ces types (lus juste avant d'écrire) ; un type supprimé est absent. */
export async function videsActuels(ids: Id[]): Promise<Record<Id, number>> {
  const snaps = await Promise.all([...new Set(ids)].map(id => getDoc(doc(db, "emballages", id))));
  return Object.fromEntries(snaps.filter(s => s.exists()).map(s => [s.id, (s.data()?.stock_vides as number | undefined) ?? 0]));
}

/** Plusieurs types d'un coup : { emballage: variation }. */
export async function mouvementsVides(
  batch: ReturnType<typeof writeBatch>, variations: Record<Id, number>,
  m: { source: SourceVides; reference_id?: Id | null; commentaire?: string | null },
) {
  const ids = Object.keys(variations).filter(e => variations[e] !== 0);
  if (!ids.length) return;
  const actuels = await videsActuels(ids);
  for (const e of ids) if (e in actuels) mouvementVides(batch, e, variations[e], actuels[e], m);
}

export const casiers: Record<string, Commande> = {
  /**
   * Tout ce qu'il faut pour compter : par type de casier, les vides et les pleins (par produit)
   * au magasin, ce que les clients doivent encore et ce qu'on doit rendre aux fournisseurs.
   */
  get_inventaire_casiers: async () => {
    const [types, formats, produits, clients, fournisseurs] = await Promise.all([
      listerEmballages(), listerFormats(), listerProduits(),
      lister<{ id: Id; emballages_dus?: Record<Id, number> }>(col("clients")),
      lister<{ id: Id; emballages_dus?: Record<Id, number> }>(col("fournisseurs")).catch(() => []),
    ]);
    const snaps = await Promise.all(types.map(t => getDoc(doc(db, "emballages", t.id))));
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const somme = (liste: { emballages_dus?: Record<Id, number> }[], e: Id) =>
      liste.reduce((t, x) => t + Math.max(0, x.emballages_dus?.[e] ?? 0), 0);
    const pleins = (e: Id | null) => formats
      .filter(f => (f.emballage_id ?? null) === e)
      .map(f => ({ format_id: f.id, produit_nom: noms.get(f.produit_id) ?? "?", volume: f.volume, unite: f.unite, casier: f.casier ?? null, stock: f.stock }))
      .sort((a, b) => a.produit_nom.localeCompare(b.produit_nom, "fr") || a.volume - b.volume);
    return {
      types: types.map((t, i) => ({
        id: t.id, nom: t.nom,
        vides: (snaps[i].data()?.stock_vides as number | undefined) ?? 0,
        dernier_comptage: (snaps[i].data()?.dernier_comptage as string | undefined) ?? null,
        pleins: pleins(t.id),
        chez_clients: somme(clients, t.id),
        a_rendre_fournisseurs: somme(fournisseurs, t.id),
      })),
      // Packs et formats sans casier consigné : seulement le stock
      sans_casier: pleins(null),
    };
  },

  /**
   * Comptage : les nombres saisis remplacent ceux de l'app ; chaque écart est tracé
   * (mouvement de stock pour les pleins, mouvement de vides pour les vides).
   */
  valider_comptage_casiers: async ({ vides, pleins, commentaire }) => {
    const comptesVides = Object.entries((vides ?? {}) as Record<Id, unknown>)
      .filter(([, n]) => n !== "" && n !== null && n !== undefined).map(([k, n]) => [k, Math.trunc(Number(n))] as const);
    const comptesPleins = Object.entries((pleins ?? {}) as Record<Id, unknown>)
      .filter(([, n]) => n !== "" && n !== null && n !== undefined).map(([k, n]) => [k, Math.trunc(Number(n))] as const);
    if ([...comptesVides, ...comptesPleins].some(([, n]) => !(n >= 0))) throw new Error("Un nombre compté ne peut pas être négatif.");
    if (!comptesVides.length && !comptesPleins.length) throw new Error("Saisissez au moins un nombre compté.");

    const note = String(commentaire ?? "").trim() || null;
    const [formats, produits, actuels] = await Promise.all([
      listerFormats(), listerProduits(), videsActuels(comptesVides.map(([k]) => k)),
    ]);
    const parId = new Map(formats.map(f => [f.id, f]));
    const noms = new Map(produits.map(p => [p.id, p.nom]));
    const batch = writeBatch(db);
    let ecarts = 0;
    for (const [e, n] of comptesVides) {
      if (!(e in actuels)) throw new Error("Un type de casier compté n'existe plus.");
      // Même sans écart, on note la date du comptage
      if (n === actuels[e]) batch.set(doc(db, "emballages", e), { dernier_comptage: maintenant() }, { merge: true });
      else { mouvementVides(batch, e, n - actuels[e], actuels[e], { source: "inventaire", commentaire: note, comptage: true }); ecarts++; }
    }
    for (const [id, n] of comptesPleins) {
      const f = parId.get(id) as Format | undefined;
      if (!f) throw new Error("Un produit compté n'existe plus.");
      if (n === f.stock) continue;
      const mouvement = ajouterMouvement(batch, f, noms.get(f.produit_id) ?? "?", {
        type: "ajustement", quantite: Math.abs(n - f.stock), stock_apres: n, source: "inventaire",
        commentaire: note ? `Comptage des casiers · ${note}` : "Comptage des casiers",
      });
      batch.update(doc(db, "formats", f.id), { stock: n, dernier_mouvement: mouvement });
      ecarts++;
    }
    await ecrire(batch.commit());
    return { ecarts };
  },

  /** Casiers vides cassés ou perdus : retirés du magasin, avec un motif à part. */
  retirer_casiers_casses: async ({ emballageId, quantite, commentaire }) => {
    const q = Math.trunc(Number(quantite));
    if (!(q > 0)) throw new Error("Indiquez le nombre de casiers cassés ou perdus.");
    const batch = writeBatch(db);
    await mouvementsVides(batch, { [emballageId as Id]: -q }, { source: "cassé", commentaire: String(commentaire ?? "").trim() || null });
    await ecrire(batch.commit());
  },

  /** Derniers mouvements de casiers vides, du plus récent au plus ancien. */
  get_mouvements_vides: async ({ emballageId }) =>
    (await lister<MouvementVides>(emballageId
      ? query(col("mouvements_vides"), where("emballage_id", "==", emballageId))
      : col("mouvements_vides")))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100),
};
