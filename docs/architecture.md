# ARCHITECTURE TECHNIQUE - STOCKFLOW

## Vue d'ensemble
Frontend React ←→ Tauri IPC ←→ Backend Rust ←→ SQLite

## Flux de données
1. Action utilisateur (clic, formulaire)
2. React appelle invoke('command_name', args)
3. Tauri route vers la fonction Rust correspondante
4. Rust exécute la requête SQL
5. SQLite retourne les données
6. Rust sérialise et retourne à React
7. React met à jour l'UI

## Composants principaux

### Frontend (src/)
- pages/        : Écrans de l'application
- components/   : Composants réutilisables (ui/ et layout/)
- stores/       : État global Zustand
- lib/          : Utilitaires (db.js, pdf.js, format.js)
- hooks/        : Custom React hooks

### Backend (src-tauri/src/)
- main.rs       : Point d'entrée Tauri
- commands.rs   : Toutes les fonctions exposées à React
- database.rs   : Connexion et migration SQLite

## Formatage des montants
Tous les montants sont stockés en valeur numérique brute.
L'affichage est géré par appStore.formatMontant(valeur) :
- FCFA : "12 500 FCFA" (espace, 0 décimales, après)
- EUR  : "€125.00"     (point, 2 décimales, avant)
- USD  : "$125.00"     (point, 2 décimales, avant)