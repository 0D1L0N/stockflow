# ÉTAPE 06 - GESTION DU STOCK

## 🎯 OBJECTIF
Implémenter les alertes, le réapprovisionnement et les ajustements.

## ✅ PRÉREQUIS
- Étapes 01 à 05 validées

## 🤖 PROMPT PARTIE A - ALERTES
Je dois implémenter le système d'alertes de stock dans StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app\
TÂCHES :

Dans src/stores/appStore.js, ajouter :

alertes: []          (formats avec stock <= seuil)
nombreAlertes: 0
loadAlertes()        → invoke('get_formats_en_alerte')


Appeler loadAlertes() :

Au démarrage de l'application
Après chaque vente validée
Après chaque réapprovisionnement
Après chaque ajustement


Dans Sidebar.jsx et BottomNav.jsx :

Afficher un badge rouge sur "Alertes stock" avec le nombre
Si nombreAlertes = 0 : pas de badge


Créer src/pages/AlertesStock.jsx complet :

Liste de tous les formats en alerte
Pour chaque format : nom produit, volume, stock actuel (rouge),
seuil, quantité manquante, suggestion de commande
Input pré-rempli avec la quantité suggérée (modifiable)
Bouton "Réapprovisionner" par ligne
Bouton "Tout commander" en haut



Confirme quand les alertes fonctionnent.

## 🤖 PROMPT PARTIE B - RÉAPPROVISIONNEMENT
Je dois créer la page de réapprovisionnement dans StockFlow.
Page concernée : src/pages/Reappro.jsx
TÂCHES :

Interface de sélection :

Dropdown produit (avec recherche)
Après sélection produit : afficher ses formats
Chaque format : card avec stock actuel, seuil, bouton réappro


Modal de réapprovisionnement (s'ouvre au clic) :

Titre : "Réapprovisionner [Produit] [Volume]L"
Stock actuel : [X] unités
Input quantité (obligatoire, > 0)
Textarea commentaire (optionnel, ex: "Livraison SOBEBRA")
Aperçu : "Nouveau stock : X + Y = Z"
Boutons Annuler / Valider


Au clic Valider :

invoke('reapprovisionner', { format_id, quantite, commentaire })
Toast "Stock mis à jour ✅"
Rafraîchir la liste des formats
Appeler loadAlertes() pour mettre à jour les badges


Historique récent (en bas de page) :

invoke('get_mouvements_stock', { type: 'entrée', limite: 10 })
Afficher : produit, format, +quantité, date, commentaire



Confirme quand le réapprovisionnement est fonctionnel.

## 🤖 PROMPT PARTIE C - AJUSTEMENT MANUEL
Je dois créer la page d'ajustement manuel du stock dans StockFlow.
Créer src/pages/AjustementStock.jsx (accessible depuis le menu "Plus")
TÂCHES :

Interface :

Dropdown produit puis dropdown format
Affiche stock actuel en grand
Radio : "Nouveau stock" ou "Ajuster par différence"
Input selon le choix (valeur absolue ou +/-)
Textarea raison OBLIGATOIRE (minimum 5 caractères)
Preview : Avant → Après


Validation et appel :

invoke('ajuster_stock', { format_id, nouveau_stock, commentaire })
Toast de confirmation avec le changement effectué
Raffraîchir alertes


Tableau des 10 derniers ajustements en bas :

Produit | Format | Avant | Après | Raison | Date



Confirme quand l'ajustement fonctionne.

## ✅ VALIDATION
- [ ] Les alertes s'affichent dans la sidebar
- [ ] La page AlertesStock liste les produits en alerte
- [ ] Le réapprovisionnement augmente le stock
- [ ] L'ajustement modifie le stock correctement
- [ ] Tous les mouvements sont tracés dans mouvements_stock