# ÉTAPE 10 - PASSAGE EN PWA + FIREBASE (MULTI-APPAREILS)

## 🎯 OBJECTIF
Rendre StockFlow utilisable sur plusieurs appareils (PC, Android, iPhone),
avec des droits par utilisateur et une synchronisation des données,
sans hébergement payant ni abonnement.

## 🧭 DÉCISIONS
| Sujet            | Choix                                   | Pourquoi                                         |
|------------------|-----------------------------------------|--------------------------------------------------|
| Distribution     | PWA (application web installable)       | Mises à jour automatiques, iPhone inclus, 0 €     |
| Hébergement      | Firebase Hosting (offre Spark gratuite) | Gratuit, HTTPS, même projet que la base           |
| Données          | Cloud Firestore + cache hors ligne      | Vente possible sans réseau, synchro au retour     |
| Connexion        | Firebase Auth (e-mail / mot de passe)   | Inclus dans l'offre gratuite                      |
| Droits           | Rôle stocké dans `users/{uid}` + règles | Appliqués côté serveur, sans Cloud Functions      |
| Version Tauri    | Conservée dans le dépôt, non maintenue  | Retour possible si imprimante Bluetooth un jour   |

## 👥 RÔLES
| Rôle        | Accès                                                                 |
|-------------|-----------------------------------------------------------------------|
| gerant      | Tout : prix, clients, ajustements, rapports, paramètres, utilisateurs |
| vendeur     | Vente, clients, ses propres ventes + (pour l'instant) réappro, ajustements, alertes, mouvements |
| magasinier  | Plus proposé à la création (fusionné avec vendeur) ; reste reconnu pour un compte existant |

## 🗂️ MODÈLE FIRESTORE
| Collection              | Contenu                                                                    |
|-------------------------|----------------------------------------------------------------------------|
| `users/{uid}`           | nom, email, role, actif                                                    |
| `produits/{id}`         | nom                                                                        |
| `formats/{id}`          | produit_id, volume, unite, prix, stock, seuil_alerte                       |
| `clients/{id}`          | nom, telephone, adresse, est_defaut (client standard : id `defaut`)        |
| `prix_clients/{c}_{f}`  | client_id, format_id, prix, date_maj                                       |
| `ventes/{id}`           | numero_facture, date, client_id, total, montant_recu, statut, vendeur_uid, items[], **format_ids[]** (requis : sert aux vérifications avant suppression) |
| `mouvements_stock/{id}` | format_id, type, quantite, stock_avant, stock_apres, source, date          |
| `stats_jour/{AAAA-MM-JJ}` | ca, nb_ventes, quantites par format (pré-calculés pour le dashboard)     |
| `parametres/general`    | commerce, devise, symbole…                                                 |
| `config/app`            | version_min (bloque les versions trop anciennes)                           |

## ⚠️ POINTS DÉLICATS
- **Stock vendu hors ligne par deux appareils** : décrément par `increment(-qte)`
  (aucune perte), stock négatif possible → alerte au gérant.
- **Numéros de facture hors ligne** : préfixe par appareil (`FACT-20261018-A-0001`).
- **Limites gratuites** (50 000 lectures / 20 000 écritures par jour) : le dashboard
  lit `stats_jour` au lieu de relire toutes les ventes.

## 🛠️ MIGRATION DU CODE
Les pages appellent `invoke("commande", args)` (src/lib/db.ts).
On garde cette interface : chaque commande est réimplémentée sur Firestore
dans `src/lib/api/`, et les pages changent très peu.

## 📋 SOUS-ÉTAPES
| N°   | Tâche                                                         | Statut |
|------|---------------------------------------------------------------|--------|
| 10.1 | Projet Firebase créé (Auth e-mail + Firestore) — par le gérant | [ ]    |
| 10.2 | Fondations : SDK Firebase, PWA, connexion, rôles, règles       | [x] code — à tester avec le projet Firebase |
| 10.3 | Gestion des utilisateurs (gérant)                              | [x] code — création à tester par le gérant |
| 10.4 | Migration Produits / Formats / Clients / Prix clients          | [x]    |
| 10.5 | Migration Vente + factures PDF (téléchargement / partage)      | [x]    |
| 10.6 | Migration Stock : réappro, ajustements, alertes, mouvements    | [x]    |
| 10.7 | Migration Historique, annulation, Dashboard (stats_jour)       | [x]    |
| 10.8 | Import des données SQLite existantes                           | [ ]    |
| 10.9 | Déploiement Firebase Hosting + tests multi-appareils / hors ligne | [~] déployé sur https://stockflow-89ad7.web.app — tests à faire |

## 🚀 PUBLIER UNE NOUVELLE VERSION
1. Augmenter `version` dans `package.json` (ex. 1.0.0 → 1.1.0)
2. `npx vite build`
3. `npx firebase-tools deploy --only "hosting,firestore:rules"`
4. Les appareils récupèrent la nouvelle version au prochain lancement.
5. Pour forcer une version minimale : Console Firestore → `config/app` → champ `version_min` (texte, ex. "1.1.0").

## 🔧 CONFIGURATION
Copier `.env.example` en `.env` et y coller les valeurs de `firebaseConfig`
(Console Firebase → Paramètres du projet → Vos applications → Web).
