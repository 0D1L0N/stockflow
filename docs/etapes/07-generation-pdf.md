# ÉTAPE 07 - GÉNÉRATION DE FACTURES PDF

## 🎯 OBJECTIF
Convertir le fichier "StockFlow Facture.html" de claude-design-export/
en composant PDF fonctionnel avec génération, impression et téléchargement.

## ✅ PRÉREQUIS
- Étapes 01 à 06 validées
- @react-pdf/renderer installé (package.json)
- Le fichier claude-design-export/StockFlow Facture.html existe
- À l'étape 03, tu as déjà créé :
  * src/components/facture/FactureHTML.jsx  (aperçu React)
  * src/components/facture/FacturePDF.jsx   (version @react-pdf/renderer)
  Cette étape connecte ces composants à la logique réelle.

## 🤖 PROMPT PARTIE A - VÉRIFICATION ET COMPLÉTION DU TEMPLATE PDF
Je dois finaliser la génération PDF de StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app\
CONTEXTE :

Le design original est dans : claude-design-export/StockFlow Facture.html
À l'étape 03, j'ai créé deux composants :

src/components/facture/FactureHTML.jsx
src/components/facture/FacturePDF.jsx



TÂCHE 1 - VÉRIFICATION :

Relis claude-design-export/StockFlow Facture.html
Relis src/components/facture/FacturePDF.jsx déjà créé
Vérifie que FacturePDF.jsx reproduit FIDÈLEMENT le design HTML :

Même structure (header, infos client, tableau, totaux, footer)
Mêmes couleurs (#1e3a5f pour header tableau, #10b981 pour total)
Même typographie et espacements
Lignes de tableau alternées blanc / #f9fafb


Si des éléments du HTML ne sont pas dans FacturePDF.jsx,
les ajouter maintenant.

TÂCHE 2 - PROPS DYNAMIQUES :
Assure-toi que FacturePDF.jsx accepte ces props exactes :
{
numero_facture,      // "FACT-20260422-0001"
date,                // "22 avril 2026 à 14:32"
client: {
nom,               // "Restaurant Le Phare"
telephone,         // "+229 97 00 00 01"
adresse            // "Cotonou Centre"
},
items: [{
nom_produit,       // "Coca-Cola"
volume,            // "33cl"
unite,             // "L"
quantite,          // 24
prix_unitaire,     // 500
sous_total         // 12000
}],
total,               // 45000
montant_recu,        // 50000 (peut être null)
monnaie_rendue,      // 5000 (peut être null)
commerce: {
nom,               // depuis parametres
adresse,
telephone,
email
},
devise: {
symbole,           // "FCFA" ou "€" ou "$"
position           // "after" ou "before"
}
}
TÂCHE 3 - FORMATAGE DES MONTANTS :
Dans FacturePDF.jsx, crée une fonction locale formatMontant(valeur, devise) :
function formatMontant(valeur, devise) {
// FCFA et similaires (position "after") :
// 12500 → "12 500 FCFA"
if (devise.position === 'after') {
return new Intl.NumberFormat('fr-FR', {
maximumFractionDigits: 0
}).format(valeur) + ' ' + devise.symbole;
}
// EUR, USD et similaires (position "before") :
// 125.5 → "€125.50"
return devise.symbole + new Intl.NumberFormat('en-US', {
minimumFractionDigits: 2,
maximumFractionDigits: 2
}).format(valeur);
}
Applique cette fonction sur TOUS les montants de la facture.
Confirme quand FacturePDF.jsx est complet et fidèle au design original.

## 🤖 PROMPT PARTIE B - FONCTIONS DE GÉNÉRATION PDF
Je dois créer les fonctions utilitaires pour générer,
télécharger et imprimer les factures PDF dans StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app
Composant PDF : src/components/facture/FacturePDF.jsx (déjà créé)
Crée le fichier src/lib/pdf.js avec ces fonctions :

prepareVenteData(vente, details, client, commerce, devise)
→ Transforme les données brutes de la BD en props pour FacturePDF
→ Formate la date : "22 avril 2026 à 14:32"
→ Mappe les items : { nom_produit, volume, unite, quantite, prix_unitaire, sous_total }
→ Retourne l'objet complet prêt pour FacturePDF
generatePDFBlob(venteData)
→ Importe pdf depuis @react-pdf/renderer
→ Crée le PDF avec FacturePDF et venteData
→ Retourne un Blob PDF
→ Gestion d'erreur : throw new Error si échec
downloadFacture(venteData)
→ Appelle generatePDFBlob(venteData)
→ Crée un lien temporaire <a> avec URL.createObjectURL
→ Nom du fichier : venteData.numero_facture + ".pdf"
(ex: "FACT-20260422-0001.pdf")
→ Déclenche le clic automatiquement
→ Révoque l'URL après téléchargement
printFacture(venteData)
→ Appelle generatePDFBlob(venteData)
→ Crée une URL objet
→ Ouvre dans une iframe cachée
→ Appelle window.print() sur cette iframe
→ Nettoie l'iframe après impression

Confirme quand src/lib/pdf.js est créé.

## 🤖 PROMPT PARTIE C - CONNEXION AU MODAL ET HISTORIQUE
Je dois connecter la génération PDF aux boutons de l'application StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app
Fichier PDF utilities : src/lib/pdf.js (créé à la partie B)
CONNEXION 1 - Modal de confirmation (src/pages/ModalConfirmationVente.jsx) :

Importer depuis src/lib/pdf.js :
import { downloadFacture, printFacture, prepareVenteData } from '@lib/pdf';
Récupérer les paramètres du commerce et la devise depuis appStore
Au clic "Imprimer" :
const data = prepareVenteData(vente, details, client, commerce, devise);
await printFacture(data);
Au clic "Télécharger PDF" :
const data = prepareVenteData(vente, details, client, commerce, devise);
await downloadFacture(data);
Ajouter un aperçu de la facture dans le modal :

Importer PDFViewer depuis @react-pdf/renderer
Hauteur 350px, largeur 100%
Afficher FacturePDF avec les données de la vente
Si PDFViewer cause des problèmes dans Tauri,
utiliser FactureHTML.jsx à la place pour l'aperçu
(FactureHTML = version React normale pour affichage)
(FacturePDF = version @react-pdf/renderer pour impression/download)



CONNEXION 2 - Historique des ventes (src/pages/HistoriqueVentes.jsx) :

Bouton "Réimprimer" sur chaque ligne de vente :

Au clic : invoke('get_vente_details', { vente_id })
Récupère aussi : invoke('get_client', { client_id })
Récupère aussi : invoke('get_parametres')
Prépare : prepareVenteData(vente, details, client, commerce, devise)
Ouvre un Modal avec :

Aperçu FactureHTML (ou PDFViewer)
Bouton Imprimer → printFacture(data)
Bouton Télécharger → downloadFacture(data)




Le modal de réimpression peut être le même
que ModalConfirmationVente.jsx en mode "réimpression"
(prop: mode="reimpression" qui cache "Nouvelle vente")

Confirme quand les connexions sont faites et teste :

Faire une vente → modal s'ouvre → imprimer → PDF correct ?
Aller dans historique → réimprimer → même résultat ?


## ✅ VALIDATION

- [ ] claude-design-export/StockFlow Facture.html relu et comparé
- [ ] FacturePDF.jsx est fidèle au design HTML original
- [ ] Tous les montants formatés selon la devise (FCFA, EUR, USD)
- [ ] src/lib/pdf.js créé avec les 4 fonctions
- [ ] Bouton "Imprimer" → boîte d'impression s'ouvre
- [ ] Bouton "Télécharger" → fichier FACT-YYYYMMDD-NNNN.pdf sauvegardé
- [ ] Aperçu de la facture visible dans le modal
- [ ] Réimpression fonctionne depuis l'historique

## ⚠️ ERREURS PROBABLES ET SOLUTIONS

**PDFViewer ne fonctionne pas dans Tauri (WebView)**
→ Utiliser FactureHTML.jsx pour l'aperçu dans le modal
→ Garder FacturePDF.jsx uniquement pour download/print

**Erreur "canvas is not defined"**
→ Ajouter dans vite.config.js :
   optimizeDeps: { exclude: ['@react-pdf/renderer'] }

**PDF généré mais vide**
→ Vérifier que les fonts sont chargées dans FacturePDF.jsx
→ @react-pdf/renderer nécessite Font.register() pour les polices custom
→ Utiliser les polices système si problème : Helvetica, Times-Roman

**Nom du fichier téléchargé incorrect**
→ Vérifier que numero_facture est bien passé dans venteData
→ Format attendu : "FACT-20260422-0001"