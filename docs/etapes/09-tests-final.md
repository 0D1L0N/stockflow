# ÉTAPE 09 - TESTS, OPTIMISATION ET BUILD FINAL

## 🎯 OBJECTIF
Tester tous les flux, corriger les bugs et builder l'application finale.

## ✅ PRÉREQUIS
- Étapes 01 à 08 validées
- Toutes les fonctionnalités MVP opérationnelles

## 🤖 PROMPT PARTIE A - TESTS COMPLETS
Je dois tester tous les flux de l'application StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app\
Exécute les tests suivants et signale chaque problème :
FLUX 1 : Vente complète

Aller sur /vente
Sélectionner "Restaurant Le Phare"
Ajouter 5x Coca-Cola 33cl (prix: 500 FCFA)
Ajouter 3x Fanta 50cl (prix: 650 FCFA)
Saisir montant reçu: 5000 FCFA
Valider → modal confirmation s'ouvre ?
Numéro facture généré ? (FACT-YYYYMMDD-NNNN)
Monnaie rendue calculée ? (5000 - 4450 = 550 FCFA)
Télécharger PDF → fichier créé ?
Vérifier que le stock a diminué

FLUX 2 : Alerte stock

Aller sur /alertes
Les produits avec stock <= seuil sont listés ?
Badge rouge dans la sidebar ?
Bouton réapprovisionner fonctionne ?

FLUX 3 : Réapprovisionnement

Aller sur /reappro
Sélectionner Fanta 50cl
Saisir quantité: 50
Valider → stock augmente ?
Mouvement d'entrée créé dans mouvements_stock ?
Badge alertes mis à jour ?

FLUX 4 : Ajustement stock

Sélectionner un produit
Ajuster à -5 avec raison "Casse"
Mouvement d'ajustement créé ?

FLUX 5 : Historique

Aller sur /historique
Les ventes s'affichent ?
Clic sur une vente → détails ?
Réimprimer → PDF généré ?
Annuler une vente → stock remis ?

FLUX 6 : Dashboard

CA du jour correspond aux ventes faites ?
Nombre d'alertes correct ?
Top 3 produits correct ?

Signale chaque test : ✅ SUCCÈS ou ❌ ÉCHEC (avec description)

## 🤖 PROMPT PARTIE B - CORRECTIONS
Voici les tests qui ont échoué dans StockFlow :
[COLLER ICI les résultats ❌ de la partie A]
Pour chaque échec :

Identifie la cause du problème
Propose et applique la correction
Re-teste pour confirmer

Priorise dans l'ordre :

Bugs bloquants (app crash)
Bugs fonctionnels (données incorrectes)
Problèmes d'affichage


## 🤖 PROMPT PARTIE C - BUILD PRODUCTION
Je veux builder StockFlow en application desktop Windows.
Mon projet : C:\Users\toige\Downloads\stock-app\
TÂCHES :

Vérifier que tauri.conf.json contient :
{
"productName": "StockFlow",
"version": "1.0.0",
"bundle": {
"active": true,
"targets": "all",
"identifier": "com.stockflow.app",
"icon": ["icons/icon.ico"]
}
}
Optimiser le build :

Vérifier que TailwindCSS purge les classes inutilisées
Vérifier que les imports sont optimisés (tree shaking)


Lancer le build :
npm run tauri build
Le fichier .exe sera dans :
src-tauri/target/release/bundle/nsis/StockFlow_1.0.0_x64-setup.exe
ou
src-tauri/target/release/bundle/msi/StockFlow_1.0.0_x64_en-US.msi
Tester l'installateur :

Installer l'application
Vérifier que la base de données se crée bien
Tester les flux principaux



Confirme quand le build est terminé et donne le chemin de l'installateur.

## ✅ VALIDATION FINALE
- [ ] Tous les flux testés sans erreur
- [ ] PDF généré correctement
- [ ] Build production réussi (.exe créé)
- [ ] Application installée et fonctionnelle
- [ ] Base de données persistante après redémarrage