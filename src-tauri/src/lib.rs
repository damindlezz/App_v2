use serde::Deserialize;
use serde_json::Value as JsonValue;
use sqlx::{Connection, sqlite::{SqliteConnectOptions, SqliteConnection}};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};


const CURRENT_MIGRATION_VERSION: i64 = 9;
const KNOWN_ORPHANED_MIGRATION_VERSION: i64 = 8;

#[tauri::command]
async fn prepare_sqlite_migration_compat(app: AppHandle) -> Result<(), String> {
    let db_path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("App-Datenverzeichnis konnte nicht ermittelt werden: {error}"))?
        .join("arabisch-lernen.db");

    if !db_path.exists() { return Ok(()); }

    let options = SqliteConnectOptions::new().filename(&db_path).create_if_missing(false);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("SQLite-Kompatibilitaetspruefung konnte die Datenbank nicht oeffnen: {error}"))?;

    let has_migration_table: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|error| format!("SQLite-Migrationstabelle konnte nicht geprueft werden: {error}"))?;
    if has_migration_table == 0 { return Ok(()); }

    // Dev-Builds vor P1 konnten bereits eine nicht mehr gebuendelte Migration 8
    // registriert haben. Nur wenn das neue P1-Schema fehlt, wird genau dieser
    // verwaiste Marker entfernt; Nutzdaten und neuere unbekannte Migrationen bleiben unangetastet.
    let has_version_8: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM _sqlx_migrations WHERE version = ?",
    )
    .bind(KNOWN_ORPHANED_MIGRATION_VERSION)
    .fetch_one(&mut connection)
    .await
    .map_err(|error| format!("SQLite-Migration 8 konnte nicht geprueft werden: {error}"))?;
    if has_version_8 > 0 {
        let has_skill_progress: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='skill_progress'",
        )
        .fetch_one(&mut connection)
        .await
        .map_err(|error| format!("SQLite-P1-Schema konnte nicht geprueft werden: {error}"))?;
        if has_skill_progress == 0 {
            sqlx::query("DELETE FROM _sqlx_migrations WHERE version = ?")
                .bind(KNOWN_ORPHANED_MIGRATION_VERSION)
                .execute(&mut connection)
                .await
                .map_err(|error| format!("Verwaiste SQLite-Migration 8 konnte nicht bereinigt werden: {error}"))?;
        }
    }

    let newer_versions: Vec<i64> = sqlx::query_scalar(
        "SELECT version FROM _sqlx_migrations WHERE version > ? ORDER BY version",
    )
    .bind(CURRENT_MIGRATION_VERSION)
    .fetch_all(&mut connection)
    .await
    .map_err(|error| format!("SQLite-Migrationsstand konnte nicht gelesen werden: {error}"))?;
    if !newer_versions.is_empty() {
        return Err(format!(
            "Unbekannte neuere SQLite-Migrationen gefunden: {:?}. Automatische Bereinigung wurde aus Sicherheitsgruenden abgebrochen.",
            newer_versions
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SqlTransactionStatement {
    query: String,
    #[serde(default)]
    values: Vec<JsonValue>,
}


fn is_allowed_write_statement(query: &str) -> bool {
    let normalized = query.split_whitespace().collect::<Vec<_>>().join(" ").to_uppercase();
    if normalized.contains(';') { return false; }
    if normalized.starts_with("PRAGMA ") {
        return normalized.starts_with("PRAGMA FOREIGN_KEYS")
            || normalized.starts_with("PRAGMA BUSY_TIMEOUT")
            || normalized.starts_with("PRAGMA JOURNAL_MODE");
    }
    const TABLES: [&str; 11] = [
        "PROFILES", "PROFILE_PROGRESS", "CONTENT_PROGRESS", "REVIEW_ITEMS",
        "LEARNING_HISTORY", "EXERCISE_ATTEMPTS", "LEARNING_SESSIONS", "QURAN_HIFZ_PROGRESS",
        "QURAN_HIFZ_WORD_PROGRESS", "SKILL_PROGRESS", "USER_ANNOTATIONS",
    ];
    TABLES.iter().any(|table| {
        normalized.starts_with(&format!("INSERT INTO {table} "))
            || normalized.starts_with(&format!("UPDATE {table} "))
            || normalized.starts_with(&format!("DELETE FROM {table} "))
    })
}

#[tauri::command]
async fn execute_sqlite_transaction(
    db_instances: State<'_, DbInstances>,
    db: String,
    statements: Vec<SqlTransactionStatement>,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let pool = match instances.get(&db) {
        Some(DbPool::Sqlite(pool)) => pool.clone(),
        #[allow(unreachable_patterns)]
        Some(_) => return Err(format!("Die Datenbank {db} ist keine SQLite-Datenbank.")),
        None => return Err(format!("Die Datenbank {db} wurde nicht geladen.")),
    };
    drop(instances);

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("SQLite-Transaktion konnte nicht gestartet werden: {error}"))?;

    for (index, statement) in statements.into_iter().enumerate() {
        if !is_allowed_write_statement(&statement.query) {
            let _ = transaction.rollback().await;
            return Err(format!("SQLite-Anweisung {} ist nicht fuer den Runtime-Schreibpfad freigegeben.", index + 1));
        }
        let mut query = sqlx::query(&statement.query);
        for value in statement.values {
            query = match value {
                JsonValue::Null => query.bind(None::<String>),
                JsonValue::String(value) => query.bind(value),
                JsonValue::Bool(value) => query.bind(if value { 1_i64 } else { 0_i64 }),
                JsonValue::Number(value) => {
                    if let Some(value) = value.as_i64() {
                        query.bind(value)
                    } else if let Some(value) = value.as_u64() {
                        if let Ok(value) = i64::try_from(value) {
                            query.bind(value)
                        } else {
                            query.bind(value as f64)
                        }
                    } else {
                        query.bind(value.as_f64().unwrap_or_default())
                    }
                }
                JsonValue::Array(value) => query.bind(JsonValue::Array(value).to_string()),
                JsonValue::Object(value) => query.bind(JsonValue::Object(value).to_string()),
            };
        }

        if let Err(error) = query.execute(&mut *transaction).await {
            let _ = transaction.rollback().await;
            return Err(format!(
                "SQLite-Speichervorgang {} ist fehlgeschlagen: {}",
                index + 1,
                error
            ));
        }
    }

    transaction
        .commit()
        .await
        .map_err(|error| format!("SQLite-Transaktion konnte nicht abgeschlossen werden: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let user_migrations = vec![
        Migration {
            version: 1,
            description: "initial_learning_schema",
            sql: include_str!("../migrations/0001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "review_queue_and_learning_history",
            sql: include_str!("../migrations/0002_reviews_history.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "normalized_learning_progress_sessions_and_attempts",
            sql: include_str!("../migrations/0003_normalized_learning.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "manual_completion_marker",
            sql: include_str!("../migrations/0004_manual_completion.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "finalize_learning_session_table",
            sql: include_str!("../migrations/0005_finalize_session_table.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "session_hifz_retention",
            sql: include_str!("../migrations/0006_session_hifz_retention.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "quran_hifz_words",
            sql: include_str!("../migrations/0007_quran_hifz_words.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "skill_progress",
            sql: include_str!("../migrations/0008_skill_progress.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "user_annotations",
            sql: include_str!("../migrations/0009_user_annotations.sql"),
            kind: MigrationKind::Up,
        },
    ];


    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:arabisch-lernen.db", user_migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            prepare_sqlite_migration_compat,
            execute_sqlite_transaction
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Start der Arabisch-Lern-App");
}
