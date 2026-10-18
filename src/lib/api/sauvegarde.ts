import { doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { col, ecrire, maintenant, type Commande } from "./outils";

// Toutes les collections de l'application (sauf config, gérée depuis la console)
const COLLECTIONS = [
  "parametres", "users", "emballages", "produits", "formats", "clients", "prix_clients", "groupes_prix", "prix_groupes", "fournisseurs", "receptions", "operations_fournisseur", "commandes_fournisseur",
  "ventes", "operations_client", "mouvements_stock", "mouvements_vides", "stats_jour",
];

export const sauvegarde: Record<string, Commande> = {
  /** Le gérant choisit : sauvegarde automatique chaque semaine (GitHub Actions) ou manuelle seulement. */
  set_sauvegarde_auto: async ({ actif }) => {
    await ecrire(setDoc(doc(db, "parametres", "general"), { sauvegarde_auto: actif === true }, { merge: true }));
  },

  /**
   * Copie complète des données au format JSON, à garder hors de Firebase
   * (téléphone, Google Drive, WhatsApp…). L'offre gratuite n'a pas de sauvegarde automatique.
   */
  exporter_donnees: async () => {
    if (!navigator.onLine) throw new Error("Connexion Internet requise pour une sauvegarde complète.");
    const collections: Record<string, unknown[]> = {};
    let total = 0;
    for (const nom of COLLECTIONS) {
      const snap = await getDocs(col(nom));
      collections[nom] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      total += snap.size;
    }
    const date = maintenant();
    await ecrire(setDoc(doc(db, "parametres", "general"), { derniere_sauvegarde: date }, { merge: true }));
    return {
      contenu: JSON.stringify({ application: "StockFlow", version_format: 1, date, collections }, null, 2),
      nom_fichier: `stockflow-sauvegarde-${date.slice(0, 10)}.json`,
      documents: total,
    };
  },
};
