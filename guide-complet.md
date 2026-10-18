# GUIDE COMPLET - ORDRE D'EXÉCUTION

## ⚠️ RÈGLE IMPORTANTE
Chaque étape doit être VALIDÉE avant de passer à la suivante.
En cas de blocage, consulter docs/troubleshooting.md

## 📋 ÉTAPES DANS L'ORDRE

| N° | Fichier                        | Durée estimée | Statut |
|----|-------------------------------|---------------|--------|
| 00 | 00-PREPARATION.md             | 10 min        | [ ]    |
| 01 | 01-INITIALISATION.md          | 20 min        | [ ]    |
| 02 | 02-BASE-DONNEES.md            | 20 min        | [ ]    |
| 03 | 03-INTEGRATION-DESIGNS.md     | 30 min        | [ ]    |
| 04 | 04-ROUTING-NAVIGATION.md      | 20 min        | [ ]    |
| 05 | 05-MODULE-VENTE.md            | 45 min        | [ ]    |
| 06 | 06-GESTION-STOCK.md           | 30 min        | [ ]    |
| 07 | 07-GENERATION-PDF.md          | 30 min        | [ ]    |
| 08 | 08-DASHBOARD.md               | 30 min        | [ ]    |
| 09 | 09-TESTS-FINAL.md             | 30 min        | [ ]    |

## 🎯 CONTEXTE À DONNER À CLAUDE CODE
Au début de chaque nouvelle session Claude Code, commence par :
"Je travaille sur StockFlow, une application Tauri + React de gestion
de stock. Le projet est dans C:\Users\toige\Downloads\stock-app\.
Je suis à l'étape [NUMÉRO]. Lis le fichier docs/etapes/[FICHIER].md
et exécute les instructions."

## ✅ CHECKLIST FINALE
- [ ] Étape 00 validée
- [ ] Étape 01 validée
- [ ] Étape 02 validée
- [ ] Étape 03 validée
- [ ] Étape 04 validée
- [ ] Étape 05 validée
- [ ] Étape 06 validée
- [ ] Étape 07 validée
- [ ] Étape 08 validée
- [ ] Étape 09 validée
- [ ] Application buildée et testée