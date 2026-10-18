# ÉTAPE 04 - ROUTING ET NAVIGATION

## 🎯 OBJECTIF
Mettre en place la navigation entre toutes les pages avec React Router.

## ✅ PRÉREQUIS
- Étape 03 validée
- Pages créées dans src/pages/

## 🤖 PROMPT POUR CLAUDE CODE
Je dois configurer React Router et la navigation complète de StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app
Pages disponibles dans src/pages/ :

Dashboard.jsx
Vente.jsx
Produits.jsx
Clients.jsx (créer une page vide pour l'instant)
Reappro.jsx (créer une page vide pour l'instant)
AlertesStock.jsx (créer une page vide pour l'instant)
HistoriqueVentes.jsx (créer une page vide pour l'instant)
HistoriqueStock.jsx (créer une page vide pour l'instant)
Parametres.jsx (créer une page vide pour l'instant)

TÂCHES :

Mettre à jour src/App.jsx avec React Router :

Route /            → Dashboard
Route /vente       → Vente
Route /produits    → Produits
Route /clients     → Clients
Route /reappro     → Reappro
Route /alertes     → AlertesStock
Route /historique  → HistoriqueVentes
Route /mouvements  → HistoriqueStock
Route /parametres  → Parametres
Toutes les routes wrappées dans Layout.jsx


Configurer Sidebar.jsx (desktop) avec :

Logo "StockFlow" en haut
Items de navigation avec icônes Lucide React :

LayoutDashboard  → Dashboard
ShoppingCart     → Nouvelle vente
Package          → Produits
Users            → Clients
RefreshCw        → Réappro
AlertTriangle    → Alertes stock (avec badge rouge si alertes)
History          → Historique ventes
TrendingUp       → Mouvements stock
Settings         → Paramètres


Item actif en surbrillance (#10b981)


Configurer BottomNav.jsx (mobile) avec 4 icônes :

LayoutDashboard → /
ShoppingCart    → /vente
Package         → /produits
Menu            → ouvre un drawer avec les autres pages


Ajouter un bouton flottant "Nouvelle vente" (FAB) :

Visible sur toutes les pages sauf /vente
Position : bottom-right fixe
Couleur : #10b981
Icône : Plus
Au clic : navigate('/vente')


Dans src/stores/appStore.js, créer le store Zustand :

nombreAlertes: 0    (mis à jour depuis le dashboard)
devise: 'FCFA'      (lu depuis les paramètres)
symbole: 'FCFA'     (lu depuis les paramètres)
position: 'after'   (before ou after le montant)
formatMontant(valeur) → fonction de formatage



Confirme que la navigation fonctionne entre toutes les pages.

## ✅ VALIDATION
- [ ] Toutes les routes fonctionnent
- [ ] La sidebar s'affiche sur desktop
- [ ] Le bottom nav s'affiche sur mobile
- [ ] Le bouton FAB est visible
- [ ] Le store Zustand est créé
- [ ] Aucune erreur de compilation
