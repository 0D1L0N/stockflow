# CLAUDE.md — StockFlow

> Lu automatiquement par Claude Code au début de chaque session.
> Court et à jour : mettre à jour la section « État actuel » en fin de session.

## Le projet en une phrase
Application de gestion de stock et de ventes pour un dépôt de boissons : vente au comptoir et sur téléphone, casiers, clients, fournisseurs, livraisons, réapprovisionnement, alertes, factures PDF.

## Architecture réelle (attention aux docs anciennes)
- **Données : Firebase / Firestore**, en temps réel. Point d'entrée unique : `invoke(commande, args)` dans `src/lib/db.ts`, servi par `src/lib/api/`.
- `docs/architecture.md`, `docs/etapes/01→09` et le README décrivent l'**ancienne** version Tauri + Rust + SQLite. La bascule est décrite dans `docs/etapes/10-pwa-firebase.md`. Ne pas réintroduire d'appels Rust/SQLite.
- `src-tauri/` existe toujours (coquille desktop), mais la logique métier est côté front.
- Frontend : React 18 + Vite 5 + TypeScript + Tailwind, état global **Zustand** (`src/stores/`).
- Droits et rôles : `src/lib/droits.ts`, `src/lib/roles.ts`, règles Firestore dans `firestore.rules`.

## Lancer et tester
```bash
npm install
npm run dev              # http://localhost:1420 (config .claude/launch.json)
npm test                 # vitest
npm run test:regles      # règles Firestore sur l'émulateur
npm run deploy           # build + Firebase Hosting + règles : uniquement sur demande explicite
```
Sauvegarde : `scripts/sauvegarde.mjs`, lancé par le workflow GitHub `sauvegarde.yml` (voir `docs/sauvegarde-automatique.md`).

## Conventions
- Interface et code métier en **français** (noms de pages, de fonctions, de commandes).
- Montants stockés bruts, affichés via `formatMontant` (FCFA : « 12 500 FCFA », sans décimale).
- Design : primaire #1e3a5f, secondaire #10b981, fond #f3f4f6, texte #1f2937, alerte #ef4444, warning #f59e0b.
- Chaque version visible se termine par son numéro dans le message de commit (ex. « Facture redessinée, rangée par casier — 1.22.1 ») et fait monter `version` dans `package.json`.

## État actuel (16 nov. 2026)
- Dossier : `D:\Projets\stockflow`, cloné depuis GitHub, branche `main` à jour (1.22.1).
- Données d'exploitation hors dépôt : `D:\Projets\stockflow-donnees` (factures émises, sauvegarde JSON du 26/10).
