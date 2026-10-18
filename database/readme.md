# 🗄️ BASE DE DONNÉES STOCKFLOW

## Fichiers

- schema.sql  → Structure complète des tables
- seed.sql    → Données initiales + données de test
- stock.db    → Fichier SQLite (créé automatiquement au premier lancement)

## Tables

| Table              | Description                         |
|-------------------|-------------------------------------|
| produits           | Produits (Coca-Cola, Fanta...)       |
| formats            | Volumes/prix/stock par produit       |
| clients            | Clients (avec Client standard)       |
| ventes             | Entête des ventes                    |
| details_vente      | Lignes de chaque vente               |
| mouvements_stock   | Historique complet des mouvements    |
| parametres         | Config (devise, commerce, etc.)      |

## Vues

| Vue                   | Description                          |
|----------------------|--------------------------------------|
| formats_avec_alertes  | Formats avec calcul des alertes      |
| statistiques_ventes   | CA et ventes par jour                |

## Règles importantes

- Le stock est géré au niveau du FORMAT (pas du produit)
- Chaque mouvement de stock crée une ligne dans mouvements_stock
- Le client "Client standard" (id=1) ne peut jamais être supprimé
- Les foreign keys sont activées (PRAGMA foreign_keys = ON)
- Numérotation factures : FACT-YYYYMMDD-NNNN (compteur quotidien)