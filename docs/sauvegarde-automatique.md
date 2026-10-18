# Sauvegarde automatique hebdomadaire

Chaque dimanche à 22 h (heure du Bénin), GitHub Actions lit toutes les données
Firestore et conserve un fichier JSON pendant **90 jours** (≈ 12 sauvegardes).
Le format est le même que la sauvegarde manuelle de l'application.

- Programme : `scripts/sauvegarde.mjs`
- Planification : `.github/workflows/sauvegarde.yml`
- Activation : Paramètres → Sauvegarde → « Automatique » / « Manuelle seulement »
  (champ `parametres/general.sauvegarde_auto` ; absent = automatique)

## Mise en place (une seule fois)

Le programme a besoin d'une **clé de compte de service** Firebase, rangée dans
les secrets du dépôt GitHub. Elle donne un accès complet aux données : ne la
partagez jamais et ne la mettez jamais dans le code.

1. Console Firebase → ⚙️ **Paramètres du projet** → onglet **Comptes de service**
   → **Générer une nouvelle clé privée** → un fichier `.json` est téléchargé.
2. GitHub → dépôt **stockflow** → **Settings** → **Secrets and variables**
   → **Actions** → **New repository secret**
   - Name : `FIREBASE_SERVICE_ACCOUNT`
   - Secret : coller **tout le contenu** du fichier `.json`
3. Supprimer le fichier `.json` de l'ordinateur (il n'est plus utile).
4. Tester : onglet **Actions** → **Sauvegarde hebdomadaire** → **Run workflow**.

## Récupérer une sauvegarde

GitHub → dépôt **stockflow** → **Actions** → **Sauvegarde hebdomadaire** →
cliquer sur une exécution → en bas, **Artifacts** → télécharger le fichier.
