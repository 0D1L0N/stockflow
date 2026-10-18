# ÉTAPE 01 - INITIALISATION DU PROJET TAURI + REACT

## 🎯 OBJECTIF
Créer le projet Tauri avec React + Vite et configurer TailwindCSS.

## ✅ PRÉREQUIS
- Étape 00 validée
- Dossier stock-app/ prêt avec tous les fichiers

## 🤖 PROMPT POUR CLAUDE CODE
Je veux initialiser un projet Tauri 2 + React + Vite.
Contexte :

Dossier du projet : C:\Users\toige\Downloads\stock-app\
Les fichiers package.json, tailwind.config.js, vite.config.js existent déjà
Node.js v24.15.0, Rust 1.95.0 installés

Tâches à exécuter dans l'ordre :

Dans C:\Users\toige\Downloads\stock-app, exécuter :
npm create tauri-app@latest . -- --template react --manager npm --force
(Le point "." signifie dossier courant)
Si un conflit avec package.json existant, utilise --force ou merge manuellement.
Remplacer le contenu de tailwind.config.js par celui déjà présent
(ne pas écraser, il a déjà le bon contenu)
Installer les dépendances supplémentaires :
npm install react-router-dom zustand lucide-react @react-pdf/renderer
npm install -D tailwindcss postcss autoprefixer
Initialiser TailwindCSS si pas encore fait :
npx tailwindcss init -p
Créer le fichier src/index.css avec :
@tailwind base;
@tailwind components;
@tailwind utilities;
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
body {
font-family: 'Inter', sans-serif;
background-color: #f3f4f6;
color: #1f2937;
}
Créer la structure de dossiers dans src/ :
src/components/ui/
src/components/layout/
src/pages/
src/stores/
src/lib/
src/hooks/
Tester avec : npm run tauri dev
(attendre que la fenêtre Tauri s'ouvre)

Confirme chaque étape et signale les erreurs.
## ✅ VALIDATION
- [ ] La commande npm create tauri-app a fonctionné
- [ ] node_modules/ existe dans stock-app/
- [ ] src/ contient les sous-dossiers créés
- [ ] src-tauri/ a été créé automatiquement
- [ ] npm run tauri dev ouvre une fenêtre Tauri vide

## ⚠️ ERREURS COURANTES

**Erreur "error during create tauri app"**
→ Supprimer node_modules/ et relancer

**Erreur "cargo not found"**
→ Redémarrer le terminal PowerShell

**Fenêtre Tauri ne s'ouvre pas**
→ Attendre 2-3 minutes (premier build Rust = long)
