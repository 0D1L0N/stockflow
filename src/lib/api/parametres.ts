import { doc, getDoc, setDoc } from "firebase/firestore";
import { telephoneFr } from "@/lib/format";
import { db } from "@/lib/firebase";
import { ecrire, type Commande } from "./outils";

const REF = () => doc(db, "parametres", "general");

// Mêmes valeurs par défaut que l'ancienne base (database/seed.sql)
const DEFAUTS = {
  nom_commerce: "Mon Dépôt",
  adresse_commerce: null as string | null,
  telephone_commerce: null as string | null,
  email_commerce: null as string | null,
  devise: "XOF",
  symbole_devise: "FCFA",
  symbole_position: "after",
  notifications_son: 1,
  mode_sombre: 0,
  langue: "fr",
  /** Proposés à la vente en livraison (on peut aussi écrire un autre nom) */
  livreurs: ["Donatien", "Ignace", "Ezekiel", "Herman"] as string[],
};

export const parametres: Record<string, Commande> = {
  get_parametres: async () => {
    const snap = await getDoc(REF());
    return { id: "general", ...DEFAUTS, ...(snap.exists() ? snap.data() : {}) };
  },

  update_parametres: async (a) => {
    await ecrire(setDoc(REF(), {
      nom_commerce: String(a.nomCommerce ?? DEFAUTS.nom_commerce).trim(),
      adresse_commerce: a.adresseCommerce ?? null,
      telephone_commerce: telephoneFr(a.telephoneCommerce),
      email_commerce: a.emailCommerce ?? null,
      devise: a.devise ?? DEFAUTS.devise,
      symbole_devise: a.symboleDevise ?? DEFAUTS.symbole_devise,
      symbole_position: a.symbolePosition === "before" ? "before" : "after",
      notifications_son: Number(a.notificationsSon ?? 1),
      mode_sombre: Number(a.modeSombre ?? 0),
      langue: a.langue ?? "fr",
      livreurs: Array.isArray(a.livreurs)
        ? [...new Set((a.livreurs as unknown[]).map(n => String(n ?? "").trim()).filter(Boolean))] : DEFAUTS.livreurs,
    }, { merge: true })); // merge : ne pas effacer les autres champs (date de sauvegarde…)
  },
};
