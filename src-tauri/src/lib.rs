mod commands;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions},
    SqlitePool,
};
use std::str::FromStr;
use tauri::Manager;

pub struct DbPool(pub SqlitePool);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("impossible de trouver app_data_dir");
            std::fs::create_dir_all(&data_dir)?;

            let db_path = data_dir.join("stock.db");
            let db_url = format!(
                "sqlite://{}?mode=rwc",
                db_path.to_str().unwrap().replace('\\', "/")
            );

            let opts = SqliteConnectOptions::from_str(&db_url)
                .unwrap()
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal);

            let pool = tauri::async_runtime::block_on(async {
                SqlitePoolOptions::new()
                    .max_connections(5)
                    .connect_with(opts)
                    .await
                    .expect("Erreur connexion SQLite")
            });

            tauri::async_runtime::block_on(async {
                init_db(&pool).await;
            });

            app.manage(DbPool(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_produits,
            commands::get_produit,
            commands::create_produit,
            commands::update_produit,
            commands::delete_produit,
            commands::get_formats_by_produit,
            commands::create_format,
            commands::update_format,
            commands::delete_format,
            commands::get_clients,
            commands::create_client,
            commands::update_client,
            commands::delete_client,
            commands::get_prix_client,
            commands::set_prix_client,
            commands::delete_prix_client,
            commands::ajuster_prix_masse,
            commands::create_vente,
            commands::get_ventes,
            commands::get_vente_details,
            commands::annuler_vente,
            commands::reapprovisionner,
            commands::ajuster_stock,
            commands::get_formats_en_alerte,
            commands::get_mouvements_stock,
            commands::get_stats_dashboard,
            commands::get_parametres,
            commands::update_parametres,
            commands::write_pdf_file,
            commands::open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn init_db(pool: &SqlitePool) {
    execute_script(pool, include_str!("../../database/schema.sql")).await;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM parametres")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if count == 0 {
        execute_script(pool, include_str!("../../database/seed.sql")).await;
    }
}

async fn execute_script(pool: &SqlitePool, sql: &str) {
    // Supprimer les lignes de commentaires avant de découper par ";"
    let cleaned: String = sql
        .lines()
        .filter(|l| !l.trim().starts_with("--"))
        .collect::<Vec<&str>>()
        .join("\n");

    for stmt in cleaned.split(';') {
        let s = stmt.trim();
        if !s.is_empty() {
            let _ = sqlx::query(s).execute(pool).await;
        }
    }
}
