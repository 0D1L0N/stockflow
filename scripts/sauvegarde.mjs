/**
 * Sauvegarde automatique hebdomadaire de StockFlow (lancée par GitHub Actions).
 *
 * Lit toutes les collections avec un compte de service Firebase (qui contourne
 * les règles de sécurité) et écrit un fichier JSON au même format que la
 * sauvegarde manuelle de l'application.
 *
 * Variables d'environnement :
 *   FIREBASE_SERVICE_ACCOUNT  contenu JSON de la clé du compte de service
 *   FORCER=1                  sauvegarde même si le gérant a choisi « manuel »
 *
 * Sortie : sauvegarde/stockflow-sauvegarde-AAAA-MM-JJ.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Même liste que la sauvegarde manuelle (src/lib/api/sauvegarde.ts)
const COLLECTIONS = [
  "parametres", "users", "emballages", "produits", "formats", "clients", "prix_clients", "groupes_prix", "prix_groupes", "fournisseurs", "receptions", "operations_fournisseur",
  "ventes", "operations_client", "mouvements_stock", "stats_jour",
];

const cle = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!cle) {
  console.error("Secret FIREBASE_SERVICE_ACCOUNT absent : voir docs/sauvegarde-automatique.md");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(cle)) });
const db = getFirestore();

// Date et heure du Bénin (UTC+1), au format utilisé par l'application
const maintenant = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
};

const parametres = (await db.doc("parametres/general").get()).data() ?? {};
if (parametres.sauvegarde_auto === false && process.env.FORCER !== "1") {
  console.log("Sauvegarde automatique désactivée par le gérant : rien à faire.");
  process.exit(0);
}

/** Les horodatages Firestore deviennent du texte ISO dans le fichier. */
const enJson = (valeur) => JSON.parse(JSON.stringify(valeur, (_, v) =>
  v && typeof v === "object" && typeof v.toDate === "function" ? v.toDate().toISOString() : v));

const date = maintenant();
const collections = {};
let total = 0;
for (const nom of COLLECTIONS) {
  const snap = await db.collection(nom).get();
  collections[nom] = snap.docs.map(d => ({ id: d.id, ...enJson(d.data()) }));
  total += snap.size;
  console.log(`${nom} : ${snap.size}`);
}

mkdirSync("sauvegarde", { recursive: true });
const fichier = `sauvegarde/stockflow-sauvegarde-${date.slice(0, 10)}.json`;
writeFileSync(fichier, JSON.stringify({ application: "StockFlow", version_format: 1, date, automatique: true, collections }, null, 2));

// Visible dans Paramètres et sur le tableau de bord
await db.doc("parametres/general").set({ derniere_sauvegarde_auto: date }, { merge: true });
console.log(`${total} enregistrements sauvegardés dans ${fichier}`);
