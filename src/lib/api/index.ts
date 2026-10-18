import { catalogue } from "./catalogue";
import { clients } from "./clients";
import { ventes } from "./ventes";
import { parametres } from "./parametres";
import { stock } from "./stock";
import { historique } from "./historique";
import { utilisateurs } from "./utilisateurs";
import { emballages } from "./emballages";
import { comptes } from "./comptes";
import { sauvegarde } from "./sauvegarde";
import { groupes } from "./groupes";
import { fournisseurs } from "./fournisseurs";
import { traduireErreur, type Commande } from "./outils";

const brutes: Record<string, Commande> = {
  ...catalogue,
  ...clients,
  ...ventes,
  ...parametres,
  ...stock,
  ...historique,
  ...utilisateurs,
  ...emballages,
  ...comptes,
  ...sauvegarde,
  ...groupes,
  ...fournisseurs,
};

/** Commandes déjà migrées vers Firestore, avec des erreurs traduites pour l'interface. */
export const commandes: Record<string, Commande> = Object.fromEntries(
  Object.entries(brutes).map(([nom, fn]) => [nom, async (args) => {
    // Comme l'ancien backend Rust, on rejette avec un simple message texte
    try { return await fn(args); } catch (e) { throw traduireErreur(e).message; }
  }]),
);

export type { Id } from "./outils";
export { CLIENT_DEFAUT } from "./clients";
