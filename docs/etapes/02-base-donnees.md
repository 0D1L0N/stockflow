# ÉTAPE 02 - BASE DE DONNÉES SQLITE

## 🎯 OBJECTIF
Configurer SQLite avec Tauri, créer toutes les tables et les premières queries.

## ✅ PRÉREQUIS
- Étape 01 validée
- Projet Tauri lancé avec succès

## 🤖 PROMPT PARTIE A - INSTALLATION DU PLUGIN SQL
Je dois configurer le plugin SQLite pour Tauri 2.
Mon projet est dans : C:\Users\toige\Downloads\stock-app\
Tâches :

Dans src-tauri/, ajouter le plugin SQL au Cargo.toml :
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
Dans src-tauri/src/main.rs (ou lib.rs), enregistrer le plugin :
.plugin(tauri_plugin_sql::Builder::new().build())
Installer le plugin npm :
npm install @tauri-apps/plugin-sql
Dans src-tauri/capabilities/default.json ou tauri.conf.json,
autoriser l'accès à SQLite :
"sql:allow-execute": true
"sql:allow-select": true
"sql:allow-load": true
Lire le fichier database/schema.sql qui existe déjà dans le projet.
Dans src-tauri/src/, créer le fichier database.rs qui :

Se connecte à la base SQLite (chemin : app_data_dir + /stock.db)
Exécute schema.sql au démarrage (migrations)
Exécute seed.sql si la base est vide

Confirme quand le plugin est installé et la base initialisée.
## 🤖 PROMPT PARTIE B - COMMANDS RUST (API)
Je dois créer les fonctions Rust (commands Tauri) pour toutes les opérations
sur la base de données SQLite.
Mon projet : C:\Users\toige\Downloads\stock-app
Base de données : SQLite avec les tables produits, formats, clients,
ventes, details_vente, mouvements_stock, parametres.
Crée le fichier src-tauri/src/commands.rs avec ces fonctions :
// ===== PRODUITS =====
get_produits()         → SELECT * FROM produits ORDER BY nom
get_produit(id)        → SELECT avec formats joints
create_produit(nom)    → INSERT INTO produits
update_produit(id,nom) → UPDATE produits
delete_produit(id)     → DELETE (bloquer si stock > 0 ou ventes existent)
// ===== FORMATS =====
get_formats_by_produit(produit_id) → SELECT formats WHERE produit_id
create_format(produit_id, volume, unite, prix, stock, seuil_alerte)
update_format(id, prix, seuil_alerte)
delete_format(id)
// ===== CLIENTS =====
get_clients()          → SELECT * FROM clients ORDER BY nom
create_client(nom, telephone, adresse)
update_client(id, nom, telephone, adresse)
delete_client(id)      → Bloquer si id = 1 (client standard)
// ===== VENTES =====
create_vente(client_id, items[], montant_recu)
→ Transaction complète :
1. Générer numero_facture : FACT-YYYYMMDD-NNNN
2. Insérer dans ventes
3. Pour chaque item : insérer dans details_vente
4. Pour chaque item : diminuer stock dans formats
5. Pour chaque item : insérer dans mouvements_stock (type=sortie)
6. Retourner l'id de la vente + numero_facture
get_ventes(date_debut, date_fin, client_id)
get_vente_details(vente_id)
annuler_vente(vente_id)
→ Transaction :
1. UPDATE ventes SET statut = 'annulée'
2. Remettre les stocks
3. Insérer mouvements_stock (type=entrée, source=inventaire)
// ===== STOCK =====
reapprovisionner(format_id, quantite, commentaire)
→ UPDATE formats SET stock = stock + quantite
→ INSERT INTO mouvements_stock (type=entrée, source=réapprovisionnement)
ajuster_stock(format_id, nouveau_stock, commentaire)
→ UPDATE formats SET stock = nouveau_stock
→ INSERT INTO mouvements_stock (type=ajustement, source=inventaire)
get_formats_en_alerte()
→ SELECT * FROM formats_avec_alertes WHERE en_alerte = 1
get_mouvements_stock(format_id, date_debut, date_fin, type)
// ===== DASHBOARD =====
get_stats_dashboard()
→ CA du jour, CA hier, nombre ventes aujourd'hui,
nombre formats en alerte, top 3 produits vendus
// ===== PARAMETRES =====
get_parametres()
update_parametres(data)
Chaque fonction doit :

Retourner Result<T, String> pour la gestion d'erreurs
Utiliser des transactions SQL pour les opérations multiples
Être enregistrée dans main.rs avec invoke_handler

Confirme quand toutes les fonctions sont créées.

## 🤖 PROMPT PARTIE C - TEST DE LA BASE

Teste la connexion à la base de données SQLite de mon projet Tauri.
Dans src/lib/, crée le fichier db.js avec :
import Database from '@tauri-apps/plugin-sql';
let db = null;
export async function getDB() {
if (!db) {
db = await Database.load('sqlite:stock.db');
}
return db;
}
export async function invoke(command, args = {}) {
const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
return tauriInvoke(command, args);
}
Ensuite dans src/App.jsx, ajoute un test au démarrage :

Appeler get_parametres() via invoke
Si OK : afficher "Base de données connectée ✅"
Si erreur : afficher le message d'erreur

Lance npm run tauri dev et confirme que la base est connectée.

## ✅ VALIDATION
- [ ] Plugin SQL installé dans Cargo.toml
- [ ] Fichier commands.rs créé avec toutes les fonctions
- [ ] La base stock.db est créée au lancement
- [ ] Le test de connexion affiche "✅ connectée"
- [ ] Les tables existent (vérifiable avec un client SQLite comme DB Browser)