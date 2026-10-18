# ÉTAPE 03 - CONVERSION ET INTÉGRATION DES DESIGNS

## 🎯 OBJECTIF
Convertir les fichiers HTML exportés par Claude Design en composants
React JSX avec TailwindCSS, prêts à recevoir des données dynamiques.

## ✅ PRÉREQUIS
- Étape 02 validée
- claude-design-export/ contient :
  * design-canvas.jsx
  * StockFlow Dashboard.html
  * StockFlow Vente.html
  * StockFlow Confirmation.html
  * StockFlow Facture.html
  * StockFlow Produits.html
  * StockFlow Clients.html
  * StockFlow Historique.html
  * StockFlow Reappro.html

## 🤖 PROMPT PARTIE A - ANALYSE DES FICHIERS
Je dois intégrer les designs exportés de Claude Design dans mon projet
React/Tauri. Les fichiers sont dans claude-design-export/.
Mon projet : C:\Users\toige\Downloads\stock-app\
PREMIÈRE TÂCHE - ANALYSE :

Lis attentivement ces fichiers dans claude-design-export/ :

design-canvas.jsx
StockFlow Dashboard.html
StockFlow Vente.html
StockFlow Confirmation.html
StockFlow Facture.html
StockFlow Produits.html
StockFlow Clients.html
StockFlow Historique.html
StockFlow Reappro.html


Pour chaque fichier HTML, identifie et liste :

La structure générale (header, sections, footer)
Les couleurs utilisées (hex codes)
Les polices et tailles
Les composants répétés (boutons, cards, tableaux, badges)
Les données statiques (à rendre dynamiques plus tard)
Les classes CSS ou styles inline utilisés


Analyse design-canvas.jsx et explique son rôle dans l'export
Dresse un inventaire complet :

Quels composants UI sont communs à plusieurs pages ?
Quelle structure de layout est utilisée ?
Y a-t-il un design system cohérent ?



NE CRÉE ENCORE AUCUN FICHIER.
Dis-moi seulement ce que tu as trouvé et comment tu comptes procéder.

## 🤖 PROMPT PARTIE B - COMPOSANTS UI DE BASE
Suite à ton analyse des fichiers HTML de claude-design-export/,
crée maintenant les composants UI réutilisables.
RÈGLES IMPORTANTES :

Reproduire FIDÈLEMENT le design des fichiers HTML
Utiliser TailwindCSS UNIQUEMENT (pas de CSS inline)
Respecter le design system :

Primaire  : #1e3a5f → tailwind: primary (configuré dans tailwind.config.js)
Secondaire: #10b981 → tailwind: secondary
Fond      : #f3f4f6 → tailwind: background
Danger    : #ef4444
Warning   : #f59e0b


Coins arrondis : rounded-lg (8px)
Ombres : shadow-card

CRÉE ces fichiers dans src/components/ui/ :

Button.jsx
Variants extraits du HTML :

primary   : bg-secondary text-white hover:bg-secondary-600
secondary : bg-gray-200 text-gray-700 hover:bg-gray-300
danger    : bg-red-500 text-white hover:bg-red-600
ghost     : bg-transparent text-gray-600 hover:bg-gray-100
Tailles : sm, md (défaut), lg
Props : variant, size, onClick, disabled, loading, icon, children


Input.jsx

Label au-dessus
Bordure grise, focus en secondary
Message d'erreur en rouge en dessous
Support icône gauche
Props : label, placeholder, value, onChange, error, icon, type


Card.jsx

Fond blanc, shadow-card, rounded-lg
Padding 16px ou 24px
Props : children, className, padding


Badge.jsx
Variants :

success : bg-green-100 text-green-700
warning : bg-orange-100 text-orange-700
danger  : bg-red-100 text-red-700
info    : bg-blue-100 text-blue-700
Props : variant, children


Modal.jsx

Overlay noir semi-transparent
Centré, rounded-lg, shadow
Bouton fermeture en haut droite
Tailles : sm, md, lg, full
Props : isOpen, onClose, title, children, size


Toast.jsx

Position fixe en haut à droite
Variants : success, error, warning, info
Auto-fermeture après 3 secondes
Animation slide-in/out
Props : message, variant, duration


Dropdown.jsx

Avec recherche intégrée (input en haut de la liste)
Option sélectionnée affichée dans le trigger
Fermeture au clic extérieur
Props : options, value, onChange, placeholder, searchable


Skeleton.jsx

Placeholder animé pour le chargement
Variants : text, card, table-row
Props : variant, count



Après chaque composant créé, confirme avec le nom du fichier.

## 🤖 PROMPT PARTIE C - LAYOUT ET NAVIGATION
Crée maintenant le layout principal de StockFlow en te basant
sur les fichiers HTML de claude-design-export/.
ANALYSE PRÉALABLE :
Regarde la structure de navigation dans tous les HTML exportés.
Identifie exactement :

La sidebar (desktop) : largeur, couleur, items
La bottom bar (mobile) : hauteur, icônes
Le header de chaque page : titre, actions

CRÉE ces fichiers dans src/components/layout/ :

Sidebar.jsx (navigation desktop, visible >= 1024px)

Largeur fixe : 240px
Fond : bg-primary (#1e3a5f)
Texte et icônes : blancs
Logo "StockFlow" en haut avec icône Package
Items de navigation avec icônes Lucide React :

LayoutDashboard → "/" → "Dashboard"
ShoppingCart    → "/vente" → "Nouvelle vente"
Package         → "/produits" → "Produits"
Users           → "/clients" → "Clients"
RefreshCw       → "/reappro" → "Réapprovisionnement"
AlertTriangle   → "/alertes" → "Alertes stock"
(+ Badge rouge avec nombreAlertes si > 0)
History         → "/historique" → "Historique ventes"
TrendingUp      → "/mouvements" → "Mouvements stock"
Settings        → "/parametres" → "Paramètres"


Item actif : bg-secondary text-white rounded-lg
Item inactif : text-white/70 hover:bg-white/10


BottomNav.jsx (navigation mobile, visible < 1024px)

Position fixe en bas
Fond blanc, bordure top grise
4 icônes : Dashboard, Vente, Produits, Menu
"Menu" ouvre un Drawer avec les autres pages
Item actif : couleur secondary


Layout.jsx (wrapper principal)

Sidebar sur desktop (lg:flex)
BottomNav sur mobile (lg:hidden)
Zone de contenu principale avec padding adapté
Bouton FAB (flottant) "+" vert pour nouvelle vente

Visible sur toutes les pages sauf /vente
Position : fixed bottom-20 right-4 (mobile) ou bottom-8 right-8 (desktop)
bg-secondary rounded-full p-4 shadow-lg
Icône Plus, taille 24px




Header.jsx

Titre de la page courante
Actions optionnelles à droite (boutons)
Props : title, actions



Confirme quand le layout est créé et fonctionne.

## 🤖 PROMPT PARTIE D - CONVERSION HTML → JSX (PAGE PAR PAGE)
Maintenant convertis chaque fichier HTML en composant React JSX.
RÈGLES DE CONVERSION :

Lire le HTML original dans claude-design-export/
Reproduire EXACTEMENT le design (couleurs, espacements, structure)
Remplacer les styles inline par des classes Tailwind équivalentes
Remplacer les données statiques par des variables avec des valeurs
par défaut (les données réelles viendront à l'étape 05)
Découper en sous-composants si une section se répète
Ajouter des états : isLoading (skeleton), isEmpty (message vide), isError

CONVERTIS dans l'ordre :
--- PAGE 1 : Dashboard ---
Source : claude-design-export/StockFlow Dashboard.html
Destination : src/pages/Dashboard.jsx
Données statiques à conserver (temporairement) :

CA du jour : 245 000 FCFA
Ventes : 12
Alertes : 3
Top produits : Coca 33cl, Fanta 50cl, Sprite 33cl


--- PAGE 2 : Vente ---
Source : claude-design-export/StockFlow Vente.html
Destination : src/pages/Vente.jsx
Données statiques à conserver :

Liste de 5 produits avec formats
Panier vide par défaut


--- PAGE 3 : Confirmation ---
Source : claude-design-export/StockFlow Confirmation.html
Destination : src/pages/ModalConfirmationVente.jsx
Convertir en Modal (pas une page complète)
Props : isOpen, onClose, venteData

--- PAGE 4 : Facture ---
Source : claude-design-export/StockFlow Facture.html
Destination : src/components/facture/FactureHTML.jsx
ET src/components/facture/FacturePDF.jsx
IMPORTANT : Créer DEUX versions :

FactureHTML.jsx  → Pour aperçu dans le modal (rendu normal React)
FacturePDF.jsx   → Pour génération PDF (avec @react-pdf/renderer)
Les deux doivent avoir le même design que le HTML original.


--- PAGE 5 : Produits ---
Source : claude-design-export/StockFlow Produits.html
Destination : src/pages/Produits.jsx

--- PAGE 6 : Clients ---
Source : claude-design-export/StockFlow Clients.html
Destination : src/pages/Clients.jsx

--- PAGE 7 : Historique ---
Source : claude-design-export/StockFlow Historique.html
Destination : src/pages/HistoriqueVentes.jsx

--- PAGE 8 : Reappro ---
Source : claude-design-export/StockFlow Reappro.html
Destination : src/pages/Reappro.jsx

Pour chaque page :

Crée le fichier JSX
Confirme que npm run dev ne retourne pas d'erreur
Passe à la page suivante

Commence par Dashboard.jsx et confirme avant de continuer.

## ✅ VALIDATION
- [ ] design-canvas.jsx analysé et compris
- [ ] Tous les composants UI créés (8 composants)
- [ ] Layout créé (Sidebar, BottomNav, Layout, Header)
- [ ] 8 pages converties en JSX sans erreur
- [ ] npm run dev fonctionne sans erreur
- [ ] Visuellement identique aux designs HTML originaux

## ⚠️ ERREURS PROBABLES ET SOLUTIONS

**Classe Tailwind non reconnue**
→ Vérifier tailwind.config.js content paths

**Style HTML non convertible en Tailwind**
→ Utiliser style={{}} pour ce cas précis uniquement

**Composant trop complexe**
→ Le découper en sous-composants dans src/components/
