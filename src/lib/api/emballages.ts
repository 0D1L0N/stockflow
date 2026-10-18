import { deleteDoc, doc, getDocs, limit, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/stores/authStore";
import { col, ecrire, lister, type Commande, type Id } from "./outils";

export interface TypeEmballage { id: Id; nom: string; ordre: number; }

// Casiers courants au dépôt ; le gérant peut en ajouter (casiers propres à une marque…)
const DEFAUTS: TypeEmballage[] = [
  { id: "casier-24", nom: "Casier 24 × 0,33 L", ordre: 1 },
  { id: "casier-20", nom: "Casier 20 × 0,5 L", ordre: 2 },
  { id: "casier-12", nom: "Casier 12 × 0,66 L", ordre: 3 },
];

// Casier habituel selon le volume de la bouteille
export const CASIER_PAR_VOLUME: Record<number, string> = { 0.33: "casier-24", 0.5: "casier-20", 0.66: "casier-12" };

/**
 * Les formats créés avant la gestion des casiers n'ont pas de champ emballage_id :
 * on leur associe le casier habituel de leur volume. (null = « aucun casier »,
 * choisi volontairement, n'est jamais modifié.)
 */
async function associerCasiersManquants(types: TypeEmballage[]) {
  const formats = await lister<{ id: Id; volume: number; emballage_id?: Id | null }>(col("formats"));
  const aCompleter = formats.filter(f => f.emballage_id === undefined);
  if (aCompleter.length === 0) return;
  const batch = writeBatch(db);
  for (const f of aCompleter) {
    const casier = CASIER_PAR_VOLUME[f.volume];
    batch.update(doc(db, "formats", f.id), {
      emballage_id: casier && types.some(t => t.id === casier) ? casier : null,
    });
  }
  await ecrire(batch.commit());
}

export async function listerEmballages(): Promise<TypeEmballage[]> {
  const gerant = useAuthStore.getState().profil?.role === "gerant";
  let liste = await lister<TypeEmballage>(col("emballages"));
  if (liste.length === 0 && gerant) {
    const batch = writeBatch(db);
    DEFAUTS.forEach(({ id, ...e }) => batch.set(doc(db, "emballages", id), e));
    await ecrire(batch.commit());
    liste = [...DEFAUTS];
  }
  if (gerant) await associerCasiersManquants(liste).catch(e => console.error("Association des casiers :", e));
  return liste.sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"));
}

export const emballages: Record<string, Commande> = {
  get_emballages: async () => listerEmballages(),

  create_emballage: async ({ nom }) => {
    if (!String(nom ?? "").trim()) throw new Error("Le nom est obligatoire.");
    const existants = await listerEmballages();
    const ref = doc(col("emballages"));
    await ecrire(setDoc(ref, { nom: String(nom).trim(), ordre: existants.length + 1 }));
    return ref.id;
  },

  update_emballage: async ({ id, nom }) => {
    if (!String(nom ?? "").trim()) throw new Error("Le nom est obligatoire.");
    await ecrire(updateDoc(doc(db, "emballages", id as Id), { nom: String(nom).trim() }));
  },

  delete_emballage: async ({ id }) => {
    const utilise = await getDocs(query(col("formats"), where("emballage_id", "==", id), limit(1)));
    if (!utilise.empty) throw new Error("Impossible de supprimer : des formats utilisent cet emballage.");
    const du = (await lister<{ id: Id; emballages_dus?: Record<string, number> }>(col("clients")))
      .some(c => (c.emballages_dus?.[id as string] ?? 0) !== 0);
    if (du) throw new Error("Impossible de supprimer : des clients doivent encore cet emballage.");
    await ecrire(deleteDoc(doc(db, "emballages", id as Id)));
  },
};
