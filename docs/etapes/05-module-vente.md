# ÉTAPE 05 - MODULE DE VENTE (CŒUR DE L'APPLICATION)

## 🎯 OBJECTIF
Développer la logique complète du module de vente avec connexion à la base.

## ✅ PRÉREQUIS
- Étapes 01 à 04 validées
- Commands Rust créées (étape 02)
- Page Vente.jsx créée (étape 03)

## 🤖 PROMPT PARTIE A - LOGIQUE DU PANIER
Je dois implémenter la logique du module de vente dans StockFlow.
Mon projet : C:\Users\toige\Downloads\stock-app
Page concernée : src/pages/Vente.jsx
TÂCHES :

Créer src/stores/venteStore.js avec Zustand :
State :

client_id: 1 (client standard par défaut)
items: []    (tableau {format_id, nom, volume, prix, quantite, sous_total})
total: 0
montant_recu: 0
monnaie_rendue: 0

Actions :

setClient(id)
addItem(format)        → ajouter ou incrémenter si déjà présent
removeItem(format_id)  → retirer du panier
updateQuantite(format_id, quantite)
updatePrix(format_id, nouveau_prix)  → modification optionnelle
setMontantRecu(montant)
calculerTotal()        → somme de tous les sous_totaux
calculerMonnaie()      → montant_recu - total
resetPanier()          → vider après vente validée


Dans src/pages/Vente.jsx, connecter l'UI au store :

Au chargement : appeler invoke('get_clients') pour la liste clients
Au chargement : appeler invoke('get_produits') pour la grille produits
Sélection client : mettre à jour venteStore.client_id
Recherche produit : filtrer localement la liste
Bouton +/- : appeler venteStore.addItem / updateQuantite
Input montant reçu : venteStore.setMontantRecu
Calculs automatiques en temps réel


Vérifications avant validation :

client_id sélectionné
Au moins 1 item dans le panier
Chaque item : quantite <= stock disponible
Si stock insuffisant : afficher erreur en rouge sur le produit


Bouton "Valider la vente" :

Afficher un spinner pendant le traitement
Appeler invoke('create_vente', { client_id, items, montant_recu })
En cas de succès : ouvrir ModalConfirmationVente
En cas d'erreur : afficher Toast d'erreur



Confirme quand la logique du panier est opérationnelle.

## 🤖 PROMPT PARTIE B - MODAL CONFIRMATION ET FACTURE
Je dois implémenter le modal de confirmation post-vente dans StockFlow.
Page concernée : src/pages/ModalConfirmationVente.jsx
TÂCHES :

Le modal reçoit ces props :

vente_id
numero_facture
client_nom
items[]
total
montant_recu
monnaie_rendue
onClose
onNouvelleVente


Contenu du modal :

Icône checkmark vert animée
"Vente enregistrée !"
Numéro de facture
Total, montant reçu, monnaie rendue
3 boutons :

"Imprimer" → déclencher impression PDF
"Télécharger PDF" → sauvegarder le fichier
"Nouvelle vente" → appeler onNouvelleVente + resetPanier




La génération PDF utilise le composant FactureTemplate.jsx
(qui sera créé à l'étape 07)
Pour l'instant, utiliser un placeholder :
console.log("PDF sera généré à l'étape 07")
Après "Nouvelle vente" :

Fermer le modal
Appeler venteStore.resetPanier()
Naviguer vers /vente (page fraîche)



Confirme quand le modal est fonctionnel.

## ✅ VALIDATION
- [ ] La liste des produits s'affiche sur la page Vente
- [ ] On peut ajouter des produits au panier
- [ ] Le total se calcule automatiquement
- [ ] La validation appelle bien invoke('create_vente')
- [ ] Le modal de confirmation s'ouvre après la vente
- [ ] Le stock diminue après la vente (vérifier dans DB Browser)
- [ ] Un mouvement de sortie est créé