08-DASHBOARD.md
markdown# ÉTAPE 08 - DASHBOARD ET MÉTRIQUES

## 🎯 OBJECTIF
Implémenter le dashboard avec métriques en temps réel.

## ✅ PRÉREQUIS
- Étapes 01 à 07 validées

## 🤖 PROMPT POUR CLAUDE CODE
Je dois implémenter le dashboard complet de StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app
Page concernée : src/pages/Dashboard.jsx
TÂCHES :

Au chargement de Dashboard.jsx, appeler :
invoke('get_stats_dashboard')
Retourne :
{
ca_aujourd_hui: 245000,
ca_hier: 198000,
ventes_aujourd_hui: 12,
nombre_alertes: 3,
total_produits: 45,
top_produits: [
{ nom: "Coca-Cola 33cl", quantite_vendue: 145 },
{ nom: "Fanta 50cl",     quantite_vendue: 98  },
{ nom: "Sprite 33cl",    quantite_vendue: 76  }
],
alertes_preview: [
{ produit_nom, volume, stock, seuil_alerte, quantite_manquante }
// 3 premiers seulement
]
}
Cartes métriques (4 cards) :

CA du jour : formatter avec devise, variation % vs hier (vert si >, rouge si <)
Ventes aujourd'hui : nombre simple
Produits en alerte : rouge si > 0, vert si = 0
Total produits : nombre avec icône


Section "Produits en alerte" :

Afficher alertes_preview (3 max)
Lien "Voir tout →" qui navigue vers /alertes
Si 0 alertes : message "Tout est en stock ✅"


Section "Top 3 produits vendus" :

Icônes médailles : 🥇 🥈 🥉
Nom du produit + quantité vendue


Rafraîchissement automatique toutes les 5 minutes :
setInterval(() => invoke('get_stats_dashboard'), 5 * 60 * 1000)
État de chargement :

Skeleton loaders pendant le chargement
Message d'erreur si invoke échoue


Mettre à jour appStore.nombreAlertes avec la valeur reçue

Confirme quand le dashboard est fonctionnel avec des données réelles.

## ✅ VALIDATION
- [ ] Les 4 cartes métriques affichent des données réelles
- [ ] La variation CA (vs hier) fonctionne
- [ ] Les alertes preview sont affichées
- [ ] Le Top 3 produits s'affiche
- [ ] Le badge alertes dans la sidebar est mis à jour
- [ ] Les skeletons s'affichent pendant le chargement
