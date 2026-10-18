use crate::DbPool;
use chrono::Local;
use serde::{Deserialize, Serialize};
use tauri::State;

// ── Structs de retour ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Produit {
    pub id: i64,
    pub nom: String,
    pub date_creation: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Format {
    pub id: i64,
    pub produit_id: i64,
    pub volume: f64,
    pub unite: String,
    pub prix: f64,
    pub stock: i64,
    pub seuil_alerte: i64,
}

#[derive(Debug, Serialize)]
pub struct ProduitAvecFormats {
    pub produit: Produit,
    pub formats: Vec<Format>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Client {
    pub id: i64,
    pub nom: String,
    pub telephone: Option<String>,
    pub adresse: Option<String>,
    pub est_defaut: i64,
    pub date_creation: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Vente {
    pub id: i64,
    pub numero_facture: String,
    pub date: Option<String>,
    pub client_id: i64,
    pub client_nom: Option<String>,
    pub total: f64,
    pub montant_recu: Option<f64>,
    pub monnaie_rendue: Option<f64>,
    pub statut: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct DetailVente {
    pub id: i64,
    pub vente_id: i64,
    pub format_id: i64,
    pub produit_nom: Option<String>,
    pub volume: Option<f64>,
    pub unite: Option<String>,
    pub quantite: i64,
    pub prix_utilise: f64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct FormatAlerte {
    pub id: i64,
    pub produit_id: i64,
    pub produit_nom: String,
    pub volume: f64,
    pub unite: String,
    pub prix: f64,
    pub stock: i64,
    pub seuil_alerte: i64,
    pub en_alerte: i64,
    pub quantite_manquante: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct MouvementStock {
    pub id: i64,
    pub format_id: i64,
    pub produit_nom: Option<String>,
    pub volume: Option<f64>,
    pub unite: Option<String>,
    pub r#type: String,
    pub quantite: i64,
    pub stock_avant: i64,
    pub stock_apres: i64,
    pub source: String,
    pub commentaire: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StatsDashboard {
    pub ca_jour: f64,
    pub ca_hier: f64,
    pub ventes_jour: i64,
    pub formats_en_alerte: i64,
    pub total_produits: i64,
    pub top_produits: Vec<TopProduit>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TopProduit {
    pub produit_nom: String,
    pub total_vendu: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Parametres {
    pub id: i64,
    pub nom_commerce: String,
    pub adresse_commerce: Option<String>,
    pub telephone_commerce: Option<String>,
    pub email_commerce: Option<String>,
    pub devise: String,
    pub symbole_devise: String,
    pub symbole_position: String,
    pub notifications_son: i64,
    pub mode_sombre: i64,
    pub langue: String,
}

// Inputs pour create_vente (Vec<VenteItem> — camelCase depuis le frontend)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VenteItem {
    pub format_id: i64,
    pub quantite: i64,
    pub prix_utilise: f64,
}

// ── PRODUITS ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_produits(state: State<'_, DbPool>) -> Result<Vec<Produit>, String> {
    sqlx::query_as::<_, Produit>(
        "SELECT id, nom, date_creation FROM produits ORDER BY nom",
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_produit(id: i64, state: State<'_, DbPool>) -> Result<ProduitAvecFormats, String> {
    let produit = sqlx::query_as::<_, Produit>(
        "SELECT id, nom, date_creation FROM produits WHERE id = ?",
    )
    .bind(id)
    .fetch_one(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let formats = sqlx::query_as::<_, Format>(
        "SELECT id, produit_id, volume, unite, prix, stock, seuil_alerte
         FROM formats WHERE produit_id = ? ORDER BY volume",
    )
    .bind(id)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    Ok(ProduitAvecFormats { produit, formats })
}

#[tauri::command]
pub async fn create_produit(nom: String, state: State<'_, DbPool>) -> Result<i64, String> {
    let res = sqlx::query("INSERT INTO produits (nom) VALUES (?)")
        .bind(&nom)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command]
pub async fn update_produit(id: i64, nom: String, state: State<'_, DbPool>) -> Result<(), String> {
    sqlx::query("UPDATE produits SET nom = ? WHERE id = ?")
        .bind(&nom)
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_produit(id: i64, state: State<'_, DbPool>) -> Result<(), String> {
    // Bloquer si stock > 0 dans un des formats
    let stock_total: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(stock),0) FROM formats WHERE produit_id = ?")
            .bind(id)
            .fetch_one(&state.0)
            .await
            .unwrap_or(0);

    if stock_total > 0 {
        return Err("Impossible de supprimer : ce produit a encore du stock.".into());
    }

    // Bloquer si des ventes existent
    let ventes: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM details_vente dv
         JOIN formats f ON f.id = dv.format_id WHERE f.produit_id = ?",
    )
    .bind(id)
    .fetch_one(&state.0)
    .await
    .unwrap_or(0);

    if ventes > 0 {
        return Err("Impossible de supprimer : des ventes existent pour ce produit.".into());
    }

    sqlx::query("DELETE FROM formats WHERE produit_id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM produits WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── FORMATS ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_formats_by_produit(
    produit_id: i64,
    state: State<'_, DbPool>,
) -> Result<Vec<Format>, String> {
    sqlx::query_as::<_, Format>(
        "SELECT id, produit_id, volume, unite, prix, stock, seuil_alerte
         FROM formats WHERE produit_id = ? ORDER BY volume",
    )
    .bind(produit_id)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_format(
    produit_id: i64,
    volume: f64,
    unite: String,
    prix: f64,
    stock: i64,
    seuil_alerte: i64,
    state: State<'_, DbPool>,
) -> Result<i64, String> {
    let res = sqlx::query(
        "INSERT INTO formats (produit_id, volume, unite, prix, stock, seuil_alerte)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(produit_id)
    .bind(volume)
    .bind(&unite)
    .bind(prix)
    .bind(stock)
    .bind(seuil_alerte)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command]
pub async fn update_format(
    id: i64,
    prix: f64,
    seuil_alerte: i64,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    sqlx::query("UPDATE formats SET prix = ?, seuil_alerte = ? WHERE id = ?")
        .bind(prix)
        .bind(seuil_alerte)
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_format(id: i64, state: State<'_, DbPool>) -> Result<(), String> {
    let ventes: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM details_vente WHERE format_id = ?")
            .bind(id)
            .fetch_one(&state.0)
            .await
            .unwrap_or(0);

    if ventes > 0 {
        return Err("Impossible de supprimer : ce format a des ventes associées.".into());
    }

    sqlx::query("DELETE FROM formats WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── CLIENTS ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_clients(state: State<'_, DbPool>) -> Result<Vec<Client>, String> {
    sqlx::query_as::<_, Client>(
        "SELECT id, nom, telephone, adresse, est_defaut, date_creation
         FROM clients ORDER BY est_defaut DESC, nom",
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_client(
    nom: String,
    telephone: Option<String>,
    adresse: Option<String>,
    state: State<'_, DbPool>,
) -> Result<i64, String> {
    let res = sqlx::query(
        "INSERT INTO clients (nom, telephone, adresse) VALUES (?, ?, ?)",
    )
    .bind(&nom)
    .bind(&telephone)
    .bind(&adresse)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;
    Ok(res.last_insert_rowid())
}

#[tauri::command]
pub async fn update_client(
    id: i64,
    nom: String,
    telephone: Option<String>,
    adresse: Option<String>,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE clients SET nom = ?, telephone = ?, adresse = ? WHERE id = ?",
    )
    .bind(&nom)
    .bind(&telephone)
    .bind(&adresse)
    .bind(id)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_client(id: i64, state: State<'_, DbPool>) -> Result<(), String> {
    if id == 1 {
        return Err("Le client standard ne peut pas être supprimé.".into());
    }

    let ventes: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ventes WHERE client_id = ?")
            .bind(id)
            .fetch_one(&state.0)
            .await
            .unwrap_or(0);

    if ventes > 0 {
        return Err("Impossible de supprimer : ce client a des ventes associées.".into());
    }

    sqlx::query("DELETE FROM clients WHERE id = ?")
        .bind(id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── PRIX PAR CLIENT ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PrixClient {
    pub format_id: i64,
    pub produit_id: i64,
    pub produit_nom: String,
    pub volume: f64,
    pub unite: String,
    pub prix_base: f64,
    pub prix_client: Option<f64>,
    pub date_maj: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ChangementPrix {
    pub client_id: Option<i64>,
    pub client_nom: Option<String>,
    pub format_id: i64,
    pub produit_nom: String,
    pub volume: f64,
    pub unite: String,
    pub ancien_prix: f64,
    #[sqlx(default)]
    pub nouveau_prix: f64,
}

/// Tous les formats avec, pour chacun, le prix spécifique du client s'il existe.
#[tauri::command]
pub async fn get_prix_client(
    client_id: i64,
    state: State<'_, DbPool>,
) -> Result<Vec<PrixClient>, String> {
    sqlx::query_as::<_, PrixClient>(
        "SELECT f.id AS format_id, p.id AS produit_id, p.nom AS produit_nom,
                f.volume, f.unite, f.prix AS prix_base,
                pc.prix AS prix_client, pc.date_maj
         FROM formats f
         JOIN produits p ON p.id = f.produit_id
         LEFT JOIN prix_clients pc ON pc.format_id = f.id AND pc.client_id = ?
         ORDER BY p.nom, f.volume",
    )
    .bind(client_id)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_prix_client(
    client_id: i64,
    format_id: i64,
    prix: f64,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    if prix <= 0.0 {
        return Err("Le prix doit être supérieur à 0.".into());
    }
    sqlx::query(
        "INSERT INTO prix_clients (client_id, format_id, prix) VALUES (?, ?, ?)
         ON CONFLICT(client_id, format_id)
         DO UPDATE SET prix = excluded.prix, date_maj = datetime('now', 'localtime')",
    )
    .bind(client_id)
    .bind(format_id)
    .bind(prix)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime le prix spécifique : le client repasse au prix de base.
#[tauri::command]
pub async fn delete_prix_client(
    client_id: i64,
    format_id: i64,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    sqlx::query("DELETE FROM prix_clients WHERE client_id = ? AND format_id = ?")
        .bind(client_id)
        .bind(format_id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Hausse (ou baisse) des prix en masse.
/// - portee   : "base" (prix des formats), "clients" (prix spécifiques) ou "tous"
/// - client_id: limite les prix spécifiques à un seul client
/// - produit_id: limite à un produit
/// - mode     : "pourcentage" ou "montant" ; valeur négative = baisse
/// - arrondi  : multiple d'arrondi (0 = aucun), vers le haut pour une hausse
/// - appliquer: false = simple aperçu, rien n'est modifié
#[tauri::command]
pub async fn ajuster_prix_masse(
    portee: String,
    client_id: Option<i64>,
    produit_id: Option<i64>,
    mode: String,
    valeur: f64,
    arrondi: f64,
    appliquer: bool,
    state: State<'_, DbPool>,
) -> Result<Vec<ChangementPrix>, String> {
    if !["base", "clients", "tous"].contains(&portee.as_str()) {
        return Err(format!("Portée inconnue : {}", portee));
    }
    if mode != "pourcentage" && mode != "montant" {
        return Err(format!("Mode inconnu : {}", mode));
    }

    let mut changements: Vec<ChangementPrix> = Vec::new();

    if portee != "clients" {
        changements.extend(
            sqlx::query_as::<_, ChangementPrix>(
                "SELECT NULL AS client_id, NULL AS client_nom, f.id AS format_id,
                        p.nom AS produit_nom, f.volume, f.unite, f.prix AS ancien_prix
                 FROM formats f JOIN produits p ON p.id = f.produit_id
                 WHERE (?1 IS NULL OR f.produit_id = ?1)
                 ORDER BY p.nom, f.volume",
            )
            .bind(produit_id)
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?,
        );
    }

    if portee != "base" {
        changements.extend(
            sqlx::query_as::<_, ChangementPrix>(
                "SELECT c.id AS client_id, c.nom AS client_nom, f.id AS format_id,
                        p.nom AS produit_nom, f.volume, f.unite, pc.prix AS ancien_prix
                 FROM prix_clients pc
                 JOIN clients c  ON c.id = pc.client_id
                 JOIN formats f  ON f.id = pc.format_id
                 JOIN produits p ON p.id = f.produit_id
                 WHERE (?1 IS NULL OR f.produit_id = ?1)
                   AND (?2 IS NULL OR pc.client_id = ?2)
                 ORDER BY c.nom, p.nom, f.volume",
            )
            .bind(produit_id)
            .bind(client_id)
            .fetch_all(&state.0)
            .await
            .map_err(|e| e.to_string())?,
        );
    }

    for c in changements.iter_mut() {
        let brut = if mode == "pourcentage" {
            c.ancien_prix * (1.0 + valeur / 100.0)
        } else {
            c.ancien_prix + valeur
        };
        c.nouveau_prix = arrondir(brut, arrondi, valeur >= 0.0);
        if c.nouveau_prix <= 0.0 {
            return Err(format!(
                "Le nouveau prix de {} {}{} serait négatif ou nul.",
                c.produit_nom, c.volume, c.unite
            ));
        }
    }

    if appliquer {
        let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;
        for c in &changements {
            let res = match c.client_id {
                None => sqlx::query("UPDATE formats SET prix = ? WHERE id = ?")
                    .bind(c.nouveau_prix)
                    .bind(c.format_id)
                    .execute(&mut *tx)
                    .await,
                Some(cid) => sqlx::query(
                    "UPDATE prix_clients SET prix = ?, date_maj = datetime('now', 'localtime')
                     WHERE client_id = ? AND format_id = ?",
                )
                .bind(c.nouveau_prix)
                .bind(cid)
                .bind(c.format_id)
                .execute(&mut *tx)
                .await,
            };
            res.map_err(|e| e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
    }

    Ok(changements)
}

fn arrondir(prix: f64, multiple: f64, vers_le_haut: bool) -> f64 {
    if multiple <= 0.0 {
        return (prix * 100.0).round() / 100.0;
    }
    // Petite tolérance pour éviter 500.0000001 → 525
    let q = prix / multiple;
    let q = if vers_le_haut { (q - 1e-9).ceil() } else { (q + 1e-9).floor() };
    q * multiple
}

// ── VENTES ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_vente(
    client_id: i64,
    items: Vec<VenteItem>,
    montant_recu: Option<f64>,
    state: State<'_, DbPool>,
) -> Result<serde_json::Value, String> {
    if items.is_empty() {
        return Err("La vente doit contenir au moins un article.".into());
    }

    let total: f64 = items.iter().map(|i| i.quantite as f64 * i.prix_utilise).sum();
    let monnaie_rendue = montant_recu.map(|m| (m - total).max(0.0));

    // Générer le numéro de facture FACT-YYYYMMDD-NNNN
    let today = Local::now().format("%Y%m%d").to_string();
    let prefix = format!("FACT-{}-", today);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ventes WHERE numero_facture LIKE ?",
    )
    .bind(format!("{}%", prefix))
    .fetch_one(&state.0)
    .await
    .unwrap_or(0);
    let numero_facture = format!("{}{:04}", prefix, count + 1);

    // Vérifier les stocks avant de commencer
    for item in &items {
        let stock: i64 =
            sqlx::query_scalar("SELECT stock FROM formats WHERE id = ?")
                .bind(item.format_id)
                .fetch_one(&state.0)
                .await
                .map_err(|_| format!("Format {} introuvable", item.format_id))?;
        if stock < item.quantite {
            return Err(format!(
                "Stock insuffisant pour le format {} (disponible: {}, demandé: {})",
                item.format_id, stock, item.quantite
            ));
        }
    }

    // Transaction
    let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;

    let vente_id = sqlx::query(
        "INSERT INTO ventes (numero_facture, client_id, total, montant_recu, monnaie_rendue)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&numero_facture)
    .bind(client_id)
    .bind(total)
    .bind(montant_recu)
    .bind(monnaie_rendue)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .last_insert_rowid();

    for item in &items {
        sqlx::query(
            "INSERT INTO details_vente (vente_id, format_id, quantite, prix_utilise)
             VALUES (?, ?, ?, ?)",
        )
        .bind(vente_id)
        .bind(item.format_id)
        .bind(item.quantite)
        .bind(item.prix_utilise)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        let stock_avant: i64 =
            sqlx::query_scalar("SELECT stock FROM formats WHERE id = ?")
                .bind(item.format_id)
                .fetch_one(&mut *tx)
                .await
                .unwrap_or(0);
        let stock_apres = stock_avant - item.quantite;

        sqlx::query("UPDATE formats SET stock = ? WHERE id = ?")
            .bind(stock_apres)
            .bind(item.format_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO mouvements_stock
             (format_id, type, quantite, stock_avant, stock_apres, source, reference_id)
             VALUES (?, 'sortie', ?, ?, ?, 'vente', ?)",
        )
        .bind(item.format_id)
        .bind(item.quantite)
        .bind(stock_avant)
        .bind(stock_apres)
        .bind(vente_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "id": vente_id,
        "numero_facture": numero_facture,
        "total": total,
        "monnaie_rendue": monnaie_rendue
    }))
}

#[tauri::command]
pub async fn get_ventes(
    date_debut: Option<String>,
    date_fin: Option<String>,
    client_id: Option<i64>,
    state: State<'_, DbPool>,
) -> Result<Vec<Vente>, String> {
    let dd = date_debut.unwrap_or_else(|| "2000-01-01".into());
    let df = date_fin.unwrap_or_else(|| "2099-12-31".into());

    let rows = if let Some(cid) = client_id {
        sqlx::query_as::<_, Vente>(
            "SELECT v.id, v.numero_facture, v.date, v.client_id, c.nom AS client_nom,
                    v.total, v.montant_recu, v.monnaie_rendue, v.statut
             FROM ventes v JOIN clients c ON c.id = v.client_id
             WHERE date(v.date) BETWEEN date(?) AND date(?)
               AND v.client_id = ?
             ORDER BY v.date DESC",
        )
        .bind(&dd)
        .bind(&df)
        .bind(cid)
        .fetch_all(&state.0)
        .await
    } else {
        sqlx::query_as::<_, Vente>(
            "SELECT v.id, v.numero_facture, v.date, v.client_id, c.nom AS client_nom,
                    v.total, v.montant_recu, v.monnaie_rendue, v.statut
             FROM ventes v JOIN clients c ON c.id = v.client_id
             WHERE date(v.date) BETWEEN date(?) AND date(?)
             ORDER BY v.date DESC",
        )
        .bind(&dd)
        .bind(&df)
        .fetch_all(&state.0)
        .await
    };

    rows.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_vente_details(
    vente_id: i64,
    state: State<'_, DbPool>,
) -> Result<serde_json::Value, String> {
    let vente = sqlx::query_as::<_, Vente>(
        "SELECT v.id, v.numero_facture, v.date, v.client_id, c.nom AS client_nom,
                v.total, v.montant_recu, v.monnaie_rendue, v.statut
         FROM ventes v JOIN clients c ON c.id = v.client_id WHERE v.id = ?",
    )
    .bind(vente_id)
    .fetch_one(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let details = sqlx::query_as::<_, DetailVente>(
        "SELECT dv.id, dv.vente_id, dv.format_id, p.nom AS produit_nom,
                f.volume, f.unite, dv.quantite, dv.prix_utilise
         FROM details_vente dv
         JOIN formats f ON f.id = dv.format_id
         JOIN produits p ON p.id = f.produit_id
         WHERE dv.vente_id = ?",
    )
    .bind(vente_id)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({ "vente": vente, "details": details }))
}

#[tauri::command]
pub async fn annuler_vente(vente_id: i64, state: State<'_, DbPool>) -> Result<(), String> {
    let statut: String =
        sqlx::query_scalar("SELECT statut FROM ventes WHERE id = ?")
            .bind(vente_id)
            .fetch_one(&state.0)
            .await
            .map_err(|_| "Vente introuvable".to_string())?;

    if statut == "annulée" {
        return Err("Cette vente est déjà annulée.".into());
    }

    let items = sqlx::query_as::<_, DetailVente>(
        "SELECT dv.id, dv.vente_id, dv.format_id, NULL AS produit_nom,
                NULL AS volume, NULL AS unite, dv.quantite, dv.prix_utilise
         FROM details_vente dv WHERE dv.vente_id = ?",
    )
    .bind(vente_id)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    let mut tx = state.0.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE ventes SET statut = 'annulée' WHERE id = ?")
        .bind(vente_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    for item in &items {
        let stock_avant: i64 =
            sqlx::query_scalar("SELECT stock FROM formats WHERE id = ?")
                .bind(item.format_id)
                .fetch_one(&mut *tx)
                .await
                .unwrap_or(0);
        let stock_apres = stock_avant + item.quantite;

        sqlx::query("UPDATE formats SET stock = ? WHERE id = ?")
            .bind(stock_apres)
            .bind(item.format_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query(
            "INSERT INTO mouvements_stock
             (format_id, type, quantite, stock_avant, stock_apres, source, reference_id, commentaire)
             VALUES (?, 'entrée', ?, ?, ?, 'vente', ?, 'Annulation vente')",
        )
        .bind(item.format_id)
        .bind(item.quantite)
        .bind(stock_avant)
        .bind(stock_apres)
        .bind(vente_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

// ── STOCK ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn reapprovisionner(
    format_id: i64,
    quantite: i64,
    commentaire: Option<String>,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    if quantite <= 0 {
        return Err("La quantité doit être positive.".into());
    }

    let stock_avant: i64 =
        sqlx::query_scalar("SELECT stock FROM formats WHERE id = ?")
            .bind(format_id)
            .fetch_one(&state.0)
            .await
            .map_err(|_| "Format introuvable".to_string())?;

    let stock_apres = stock_avant + quantite;

    sqlx::query("UPDATE formats SET stock = ? WHERE id = ?")
        .bind(stock_apres)
        .bind(format_id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO mouvements_stock
         (format_id, type, quantite, stock_avant, stock_apres, source, commentaire)
         VALUES (?, 'entrée', ?, ?, ?, 'réapprovisionnement', ?)",
    )
    .bind(format_id)
    .bind(quantite)
    .bind(stock_avant)
    .bind(stock_apres)
    .bind(&commentaire)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn ajuster_stock(
    format_id: i64,
    nouveau_stock: i64,
    commentaire: Option<String>,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    if nouveau_stock < 0 {
        return Err("Le stock ne peut pas être négatif.".into());
    }

    let stock_avant: i64 =
        sqlx::query_scalar("SELECT stock FROM formats WHERE id = ?")
            .bind(format_id)
            .fetch_one(&state.0)
            .await
            .map_err(|_| "Format introuvable".to_string())?;

    let diff = nouveau_stock - stock_avant;

    sqlx::query("UPDATE formats SET stock = ? WHERE id = ?")
        .bind(nouveau_stock)
        .bind(format_id)
        .execute(&state.0)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO mouvements_stock
         (format_id, type, quantite, stock_avant, stock_apres, source, commentaire)
         VALUES (?, 'ajustement', ?, ?, ?, 'inventaire', ?)",
    )
    .bind(format_id)
    .bind(diff.abs())
    .bind(stock_avant)
    .bind(nouveau_stock)
    .bind(&commentaire)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_formats_en_alerte(
    state: State<'_, DbPool>,
) -> Result<Vec<FormatAlerte>, String> {
    sqlx::query_as::<_, FormatAlerte>(
        "SELECT id, produit_id, produit_nom, volume, unite, prix,
                stock, seuil_alerte, en_alerte, quantite_manquante
         FROM formats_avec_alertes WHERE en_alerte = 1
         ORDER BY quantite_manquante DESC",
    )
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mouvements_stock(
    format_id: Option<i64>,
    date_debut: Option<String>,
    date_fin: Option<String>,
    type_mouvement: Option<String>,
    state: State<'_, DbPool>,
) -> Result<Vec<MouvementStock>, String> {
    let dd = date_debut.unwrap_or_else(|| "2000-01-01".into());
    let df = date_fin.unwrap_or_else(|| "2099-12-31".into());

    sqlx::query_as::<_, MouvementStock>(
        "SELECT ms.id, ms.format_id, p.nom AS produit_nom, f.volume, f.unite,
                ms.type, ms.quantite, ms.stock_avant, ms.stock_apres,
                ms.source, ms.commentaire, ms.date
         FROM mouvements_stock ms
         JOIN formats f ON f.id = ms.format_id
         JOIN produits p ON p.id = f.produit_id
         WHERE (? IS NULL OR ms.format_id = ?)
           AND date(ms.date) BETWEEN date(?) AND date(?)
           AND (? IS NULL OR ms.type = ?)
         ORDER BY ms.date DESC
         LIMIT 500",
    )
    .bind(format_id)
    .bind(format_id)
    .bind(&dd)
    .bind(&df)
    .bind(&type_mouvement)
    .bind(&type_mouvement)
    .fetch_all(&state.0)
    .await
    .map_err(|e| e.to_string())
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_stats_dashboard(state: State<'_, DbPool>) -> Result<StatsDashboard, String> {
    let ca_jour: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total),0) FROM ventes
         WHERE date(date) = date('now','localtime') AND statut = 'validée'",
    )
    .fetch_one(&state.0)
    .await
    .unwrap_or(0.0);

    let ca_hier: f64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(total),0) FROM ventes
         WHERE date(date) = date('now','localtime','-1 day') AND statut = 'validée'",
    )
    .fetch_one(&state.0)
    .await
    .unwrap_or(0.0);

    let ventes_jour: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM ventes
         WHERE date(date) = date('now','localtime') AND statut = 'validée'",
    )
    .fetch_one(&state.0)
    .await
    .unwrap_or(0);

    let formats_en_alerte: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM formats_avec_alertes WHERE en_alerte = 1")
            .fetch_one(&state.0)
            .await
            .unwrap_or(0);

    let total_produits: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM produits")
        .fetch_one(&state.0)
        .await
        .unwrap_or(0);

    let top_produits = sqlx::query_as::<_, TopProduit>(
        "SELECT p.nom AS produit_nom, SUM(dv.quantite) AS total_vendu
         FROM details_vente dv
         JOIN formats f ON f.id = dv.format_id
         JOIN produits p ON p.id = f.produit_id
         JOIN ventes v ON v.id = dv.vente_id
         WHERE v.statut = 'validée'
           AND date(v.date) = date('now','localtime')
         GROUP BY p.id, p.nom
         ORDER BY total_vendu DESC
         LIMIT 3",
    )
    .fetch_all(&state.0)
    .await
    .unwrap_or_default();

    Ok(StatsDashboard {
        ca_jour,
        ca_hier,
        ventes_jour,
        formats_en_alerte,
        total_produits,
        top_produits,
    })
}

// ── PARAMETRES ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_parametres(state: State<'_, DbPool>) -> Result<Parametres, String> {
    sqlx::query_as::<_, Parametres>(
        "SELECT id, nom_commerce, adresse_commerce, telephone_commerce, email_commerce,
                devise, symbole_devise, symbole_position, notifications_son, mode_sombre, langue
         FROM parametres WHERE id = 1",
    )
    .fetch_one(&state.0)
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_parametres(
    nom_commerce: String,
    adresse_commerce: Option<String>,
    telephone_commerce: Option<String>,
    email_commerce: Option<String>,
    devise: String,
    symbole_devise: String,
    symbole_position: String,
    notifications_son: i64,
    mode_sombre: i64,
    langue: String,
    state: State<'_, DbPool>,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE parametres SET
         nom_commerce = ?, adresse_commerce = ?, telephone_commerce = ?,
         email_commerce = ?, devise = ?, symbole_devise = ?,
         symbole_position = ?, notifications_son = ?, mode_sombre = ?, langue = ?
         WHERE id = 1",
    )
    .bind(&nom_commerce)
    .bind(&adresse_commerce)
    .bind(&telephone_commerce)
    .bind(&email_commerce)
    .bind(&devise)
    .bind(&symbole_devise)
    .bind(&symbole_position)
    .bind(notifications_son)
    .bind(mode_sombre)
    .bind(&langue)
    .execute(&state.0)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/// Écrit les bytes d'un PDF dans le fichier choisi par l'utilisateur.
/// Rust contourne les restrictions de scope du plugin fs.
#[tauri::command]
pub async fn write_pdf_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| format!("Impossible d'écrire le PDF : {}", e))
}

/// Ouvre un fichier avec l'application par défaut du système.
/// Contourne la restriction regex de shell:allow-open qui n'accepte que les URLs.
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Impossible d'ouvrir le fichier : {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Impossible d'ouvrir le fichier : {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Impossible d'ouvrir le fichier : {}", e))?;
    }
    Ok(())
}
