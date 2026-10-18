# GUIDE DE DÉPANNAGE - STOCKFLOW

## Erreurs courantes

### "cargo not found" ou "rustc not found"
→ Fermer et rouvrir PowerShell
→ Vérifier : rustc --version

### "VCRUNTIME140.dll not found"
→ Installer Visual C++ Redistributable depuis microsoft.com

### "npm run tauri dev" : fenêtre qui ne s'ouvre pas
→ Attendre 3-5 minutes (premier build Rust est long)
→ Regarder les logs dans le terminal

### "failed to bundle project"
→ Vérifier que Visual Studio Build Tools 2022 est installé
→ Redémarrer et réessayer

### Base de données vide au démarrage
→ Vérifier que seed.sql est exécuté dans database.rs
→ Supprimer stock.db et relancer pour réinitialiser

### PDF ne se génère pas
→ Vérifier que @react-pdf/renderer est installé
→ npm install @react-pdf/renderer

### Erreur de foreign key SQLite
→ Vérifier PRAGMA foreign_keys = ON dans database.rs
→ Ordre d'insertion : produits → formats → clients → ventes

## Commandes utiles

# Réinstaller les dépendances
npm install

# Nettoyer le build Rust
cd src-tauri && cargo clean

# Voir les logs Tauri
npm run tauri dev 2>&1 | tee debug.log

# Ouvrir la base SQLite (si DB Browser installé)
# Fichier : %APPDATA%\com.stockflow.app\stock.db