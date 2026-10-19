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
import { casiers } from "./casiers";
import { journal, journaliser, suivis } from "./journal";
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
  ...casiers,
  ...journal,
};

/** Commandes déjà migrées vers Firestore, avec des erreurs traduites pour l'interface. */
export const commandes: Record<string, Commande> = Object.fromEntries(
  Object.entries(brutes).map(([nom, fn]) => [nom, async (args) => {
    // Comme l'ancien backend Rust, on rejette avec un simple message texte
    try {
      // Journal des actions : état d'avant lu ici, entrée écrite seulement si la commande réussit
      const suivi = suivis[nom];
      const avant = suivi ? await suivi.avant(args).catch(() => undefined) : undefined;
      const resultat = await fn(args);
      if (suivi && avant !== undefined) {
        // Sans attendre : l'utilisateur n'est jamais ralenti par le journal
        suivi.apres(args, resultat, avant)
          .then(entree => { if (entree) return journaliser(entree); })
          .catch(err => console.error("Journal des actions :", err));
      }
      return resultat;
    } catch (e) { throw traduireErreur(e).message; }
  }]),
);

export type { Id } from "./outils";
export { CLIENT_DEFAUT } from "./clients";
