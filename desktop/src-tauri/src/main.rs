#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Nonce};
use base64::prelude::*;
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    net::{TcpStream, ToSocketAddrs},
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;
use uuid::Uuid;

const KEYRING_SERVICE: &str = "com.beboss.desktop";
const KEYRING_DATABASE_KEY: &str = "database-encryption-key";

/// Internal keys that the renderer bridge must never read or write directly.
/// These are managed by the desktop host (device identity, sync clock, snapshots).
const RESERVED_SECURE_KEYS: &[&str] = &[
    "desktop-device-id",
    "snapshot",
    "effective-clock",
    "last-hlc",
    "shop_sync_key",
    "shop-",
    "device-",
    "beBoss-",
];

fn is_reserved_key(key: &str) -> bool {
    RESERVED_SECURE_KEYS.iter().any(|prefix| key == *prefix || key.starts_with(prefix))
}

/// Secure-storage keys must be a simple namespaced identifier. This prevents a
/// compromised renderer from guessing or enumerating arbitrary vault keys.
fn is_valid_secure_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 180
        && key.bytes().all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b'.' | b':'))
        && !is_reserved_key(key)
}

static PROCESS_START: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

fn is_subscription_active(status: &str, expires_at: i64, effective_now: i64) -> bool {
    !matches!(status.to_ascii_uppercase().as_str(), "EXPIRED" | "SUSPENDED" | "CANCELLED")
        && expires_at > effective_now
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("beboss-local.sqlite"))
}

fn database_key() -> Result<String, String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_DATABASE_KEY)
        .map_err(|error| format!("Could not open the operating-system credential vault: {error}"))?;
    match entry.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => {
            let key = Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string();
            entry.set_password(&key)
                .map_err(|error| format!("Could not persist the database key in the operating-system credential vault: {error}"))?;
            Ok(key)
        }
        Err(error) => Err(format!("The operating-system credential vault is unavailable; the local database was not opened: {error}")),
    }
}

fn key_hex(key_seed: &str) -> String {
    derive_cipher_key(key_seed)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn apply_sqlcipher_key(connection: &Connection, key_seed: &str) -> Result<String, String> {
    let hex = key_hex(key_seed);
    connection.execute_batch(&format!("PRAGMA key = \"x'{hex}'\";"))
        .map_err(|error| format!("Could not apply the local database key: {error}"))?;
    let version = connection.query_row("PRAGMA cipher_version", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("SQLCipher is unavailable or could not be initialized: {error}"))?;
    if version.trim().is_empty() {
        return Err("SQLCipher did not report an active cipher version.".into());
    }
    Ok(version)
}

fn open_keyed_database(path: &std::path::Path, key_seed: &str) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    apply_sqlcipher_key(&connection, key_seed)?;
    connection.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("The local database could not be authenticated: {error}"))?;
    Ok(connection)
}

/// Upgrade the earlier plaintext SQLite file in place. The original database is only
/// replaced after SQLCipher exports it and a keyed reopen succeeds; an unsuccessful
/// migration leaves the original file untouched for recovery.
fn migrate_plaintext_database(path: &std::path::Path, key_seed: &str) -> Result<(), String> {
    let temporary = path.with_extension("sqlite.sqlcipher-migration");
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|error| format!("Could not clear an earlier migration file: {error}"))?;
    }

    let migration = (|| -> Result<(), String> {
        let source = Connection::open(path).map_err(|error| error.to_string())?;
        source.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")
            .map_err(|error| format!("Could not safely checkpoint the existing database: {error}"))?;
        source.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))
            .map_err(|error| format!("The existing database is not a readable legacy SQLite file: {error}"))?;

        let escaped_path = temporary.to_string_lossy().replace('\'', "''");
        let attach = format!(
            "ATTACH DATABASE '{escaped_path}' AS encrypted KEY \"x'{}'\";",
            key_hex(key_seed)
        );
        source.execute_batch(&attach)
            .map_err(|error| format!("Could not create the encrypted migration database: {error}"))?;
        source.execute_batch("SELECT sqlcipher_export('encrypted');")
            .map_err(|error| format!("SQLCipher could not export the existing shop data: {error}"))?;
        source.execute_batch("DETACH DATABASE encrypted;")
            .map_err(|error| format!("Could not finalize the encrypted database export: {error}"))?;
        drop(source);

        let verified = open_keyed_database(&temporary, key_seed)?;
        verified.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))
            .map_err(|error| format!("The encrypted database failed its integrity check: {error}"))?;
        drop(verified);

        let backup = path.with_extension(format!("sqlite.plaintext-{}", Uuid::new_v4().simple()));
        fs::rename(path, &backup)
            .map_err(|error| format!("Could not preserve the original database during migration: {error}"))?;
        if let Err(error) = fs::rename(&temporary, path) {
            let _ = fs::rename(&backup, path);
            return Err(format!("Could not install the encrypted database; the original file was restored: {error}"));
        }
        fs::remove_file(&backup)
            .map_err(|error| format!("The encrypted database is ready, but the old plaintext backup could not be removed: {} ({error})", backup.display()))?;
        Ok(())
    })();

    if migration.is_err() && temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    migration
}

fn derive_cipher_key(seed: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.update(b"BEBOSS-DESKTOP-SALT-2026");
    hasher.finalize().into()
}

fn encrypt_payload(plaintext: &str, key_seed: &str) -> Result<String, String> {
    let key_bytes = derive_cipher_key(key_seed);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let mut nonce_hasher = Sha256::new();
    nonce_hasher.update(key_seed.as_bytes());
    nonce_hasher.update(plaintext.as_bytes());
    nonce_hasher.update(Uuid::new_v4().as_bytes());
    let nonce_hash = nonce_hasher.finalize();
    let nonce = Nonce::from_slice(&nonce_hash[..12]);
    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;
    let mut envelope = nonce_hash[..12].to_vec();
    envelope.extend_from_slice(&ciphertext);
    Ok(BASE64_STANDARD.encode(envelope))
}

fn decrypt_payload(ciphertext_b64: &str, key_seed: &str) -> Result<String, String> {
    let key_bytes = derive_cipher_key(key_seed);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let envelope = BASE64_STANDARD.decode(ciphertext_b64).map_err(|e| e.to_string())?;
    if envelope.len() < 28 { return Err("Invalid secure-value envelope".into()); }
    let nonce = Nonce::from_slice(&envelope[..12]);
    let plaintext = cipher.decrypt(nonce, &envelope[12..]).map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

fn stamp_desktop_records(value: &mut Value, hlc: i64, updated_since: i64, device_id: &str) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(|item| stamp_desktop_records(item, hlc, updated_since, device_id)),
        Value::Object(object) => {
            let is_recent = object.get("updatedAt").and_then(Value::as_i64).is_some_and(|updated_at| updated_at >= updated_since);
            let is_desktop_record = is_recent && object.get("lastModifiedDeviceId").and_then(Value::as_str) == Some("DESKTOP");
            if is_desktop_record {
                object.insert("hlcTimestamp".to_string(), Value::Number(Number::from(hlc)));
                object.insert("lastModifiedDeviceId".to_string(), Value::String(device_id.to_string()));
            }
            let is_recent_tombstone = object.get("deletedAt").and_then(Value::as_i64).is_some_and(|deleted_at| deleted_at >= updated_since)
                && object.get("deletedByDeviceId").and_then(Value::as_str) == Some("DESKTOP");
            if is_recent_tombstone {
                object.insert("hlcTimestamp".to_string(), Value::Number(Number::from(hlc)));
                object.insert("deletedByDeviceId".to_string(), Value::String(device_id.to_string()));
            }
            object.values_mut().for_each(|item| stamp_desktop_records(item, hlc, updated_since, device_id));
        }
        _ => {}
    }
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    let key_seed = database_key()?;
    let has_existing_file = path.metadata().map(|metadata| metadata.len() > 0).unwrap_or(false);

    let connection = if has_existing_file {
        match open_keyed_database(&path, &key_seed) {
            Ok(connection) => connection,
            Err(encrypted_error) => {
                // Old desktop versions used ordinary SQLite. Only migrate when the
                // existing file can be read without a key; never overwrite an
                // encrypted/corrupt database after a failed key check.
                let is_legacy_plaintext = Connection::open(&path)
                    .and_then(|legacy| legacy.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0)))
                    .is_ok();
                if !is_legacy_plaintext {
                    return Err(format!(
                        "BeBoss could not unlock its local SQLCipher database. The original data has not been changed. Check the operating-system credential vault or restore a trusted backup. ({encrypted_error})"
                    ));
                }
                migrate_plaintext_database(&path, &key_seed)?;
                open_keyed_database(&path, &key_seed)?
            }
        }
    } else {
        open_keyed_database(&path, &key_seed)?
    };

    connection.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS local_state (
             key TEXT PRIMARY KEY NOT NULL,
             value TEXT NOT NULL,
             updated_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS secure_values (
             key TEXT PRIMARY KEY NOT NULL,
             value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS sync_outbox (
             id TEXT PRIMARY KEY NOT NULL,
             operation TEXT NOT NULL,
             payload TEXT NOT NULL,
             hlc INTEGER NOT NULL,
             device_id TEXT NOT NULL,
             status TEXT NOT NULL DEFAULT 'PENDING',
             attempts INTEGER NOT NULL DEFAULT 0,
             last_error TEXT NOT NULL DEFAULT '',
             expected_updated_at INTEGER NOT NULL DEFAULT 0,
             created_at INTEGER NOT NULL
         );
         CREATE TABLE IF NOT EXISTS hardware_logs (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             category TEXT NOT NULL,
             message TEXT NOT NULL,
             created_at INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS sync_outbox_ready ON sync_outbox(status, created_at);"
    ).map_err(|error| error.to_string())?;
    Ok(connection)
}

fn now_millis() -> Result<i64, String> {
    SystemTime::now().duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
struct PendingTransaction {
    id: String,
    payload: Value,
    hlc: i64,
    #[serde(rename = "expectedUpdatedAt")]
    expected_updated_at: i64,
}

#[derive(Serialize)]
struct SystemDiagnostics {
    #[serde(rename = "osPlatform")]
    os_platform: String,
    #[serde(rename = "osArch")]
    os_arch: String,
    #[serde(rename = "appVersion")]
    app_version: String,
    #[serde(rename = "dbPath")]
    db_path: String,
    #[serde(rename = "dbSizeBytes")]
    db_size_bytes: u64,
    #[serde(rename = "pendingOutboxCount")]
    pending_outbox_count: i64,
    #[serde(rename = "uptimeSeconds")]
    uptime_seconds: u64,
    hostname: String,
    #[serde(rename = "databaseEncrypted")]
    database_encrypted: bool,
    #[serde(rename = "databaseCipherVersion")]
    database_cipher_version: String,
}

#[derive(Serialize)]
struct NetworkPingResult {
    host: String,
    #[serde(rename = "latencyMs")]
    latency_ms: u64,
    reachable: bool,
    details: String,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct ReceiptItemPayload {
    name: String,
    quantity: f64,
    #[serde(rename = "unitPrice")]
    unit_price: f64,
    subtotal: f64,
}

#[derive(Deserialize)]
struct ReceiptPrintPayload {
    #[serde(rename = "shopName")]
    shop_name: String,
    #[serde(rename = "receiptNumber")]
    receipt_number: String,
    date: String,
    cashier: String,
    customer: String,
    items: Vec<ReceiptItemPayload>,
    subtotal: f64,
    discount: f64,
    total: f64,
    paid: f64,
    balance: f64,
    #[serde(rename = "paymentMethod")]
    payment_method: String,
    tin: String,
    address: String,
    phone: String,
    header: String,
    footer: String,
    seal: String,
}

#[derive(Serialize)]
struct EscposPrintResult {
    success: bool,
    #[serde(rename = "base64Bytes")]
    base64_bytes: String,
    #[serde(rename = "spoolPath")]
    spool_path: String,
    message: String,
}

#[derive(Serialize)]
struct FileExportResult {
    success: bool,
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "fileSizeBytes")]
    file_size_bytes: usize,
    sha256: String,
}


// ────────────────────── TAURI COMMANDS ──────────────────────

#[tauri::command]
fn secure_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    if !is_valid_secure_key(&key) { return Err("Invalid secure-storage key.".into()); }
    let connection = open_database(&app)?;
    let raw: Option<String> = connection.query_row("SELECT value FROM secure_values WHERE key = ?1", [key], |row| row.get(0))
        .optional().map_err(|error| error.to_string())?;
    
    match raw {
        Some(stored) => {
            let key_seed = database_key()?;
            // Attempt decryption; if legacy plaintext, return as is
            if let Ok(decrypted) = decrypt_payload(&stored, &key_seed) {
                Ok(Some(decrypted))
            } else {
                Ok(Some(stored))
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn secure_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if !is_valid_secure_key(&key) || value.len() > 8_000_000 { return Err("Invalid secure-storage value.".into()); }
    let key_seed = database_key()?;
    let encrypted = encrypt_payload(&value, &key_seed)?;
    let connection = open_database(&app)?;
    connection.execute("INSERT INTO secure_values(key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", params![key, encrypted])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn secure_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    if !is_valid_secure_key(&key) { return Err("Invalid secure-storage key.".into()); }
    let connection = open_database(&app)?;
    connection.execute("DELETE FROM secure_values WHERE key = ?1", [key]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_device_id(app: tauri::AppHandle) -> Result<String, String> {
    let connection = open_database(&app)?;
    if let Some(device_id) = connection.query_row("SELECT value FROM local_state WHERE key = 'desktop-device-id'", [], |row| row.get::<_, String>(0)).optional().map_err(|error| error.to_string())? {
        return Ok(device_id);
    }
    let device_id = Uuid::new_v4().to_string();
    connection.execute("INSERT INTO local_state(key, value, updated_at) VALUES ('desktop-device-id', ?1, ?2)", params![device_id, now_millis()?])
        .map_err(|error| error.to_string())?;
    Ok(device_id)
}

#[tauri::command]
fn local_load(app: tauri::AppHandle) -> Result<Option<Value>, String> {
    let connection = open_database(&app)?;
    let value = connection.query_row("SELECT value FROM local_state WHERE key = 'snapshot'", [], |row| row.get::<_, String>(0))
        .optional().map_err(|error| error.to_string())?;
    value.map(|json| serde_json::from_str(&json).map_err(|error| error.to_string())).transpose()
}

#[tauri::command]
fn local_queue(
    app: tauri::AppHandle,
    operation: String,
    mut payload: Value,
    device_id: String,
    expected_updated_at: i64,
    requires_active_subscription: bool,
    subscription_expires_at: i64,
    subscription_status: String,
) -> Result<PendingTransaction, String> {
    if operation.is_empty() || operation.len() > 100 || device_id.is_empty() || device_id.len() > 180 || expected_updated_at < 0 {
        return Err("Invalid local transaction.".into());
    }
    let connection = open_database(&app)?;
    let wall_now = now_millis()?;
    let previous_effective_now: Option<String> = connection.query_row(
        "SELECT value FROM local_state WHERE key = 'effective-clock'", [], |row| row.get(0)
    ).optional().map_err(|error| error.to_string())?;
    let now = wall_now.max(previous_effective_now.and_then(|value| value.parse::<i64>().ok()).unwrap_or(0));
    connection.execute(
        "INSERT INTO local_state(key, value, updated_at) VALUES ('effective-clock', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![now.to_string(), now]
    ).map_err(|error| error.to_string())?;
    if requires_active_subscription && !is_subscription_active(&subscription_status, subscription_expires_at, now) {
        return Err("The shop subscription is expired or suspended. Renew it before recording another sale.".into());
    }
    let prior_outbox_hlc: Option<i64> = connection.query_row("SELECT MAX(hlc) FROM sync_outbox", [], |row| row.get(0)).map_err(|error| error.to_string())?;
    let prior_saved_hlc: Option<String> = connection.query_row("SELECT value FROM local_state WHERE key = 'last-hlc'", [], |row| row.get(0)).optional().map_err(|error| error.to_string())?;
    let prior_hlc = prior_outbox_hlc.into_iter().chain(prior_saved_hlc.and_then(|value| value.parse::<i64>().ok())).max();
    let wall_hlc = now.checked_shl(16).ok_or_else(|| "Clock value is out of range.".to_string())?;
    let hlc = wall_hlc.max(prior_hlc.unwrap_or(0).saturating_add(1));
    stamp_desktop_records(&mut payload, hlc, now.saturating_sub(60_000), &device_id);
    let id = Uuid::new_v4().to_string();
    let serialized = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    transaction.execute("INSERT INTO local_state(key, value, updated_at) VALUES ('snapshot', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params![serialized, now])
        .map_err(|error| error.to_string())?;
    transaction.execute("INSERT INTO local_state(key, value, updated_at) VALUES ('last-hlc', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params![hlc.to_string(), now])
        .map_err(|error| error.to_string())?;
    transaction.execute("INSERT INTO sync_outbox(id, operation, payload, hlc, device_id, expected_updated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![id, operation, serialized, hlc, device_id, expected_updated_at, now])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(PendingTransaction { id, payload, hlc, expected_updated_at })
}

#[tauri::command]
fn local_pending(app: tauri::AppHandle) -> Result<Vec<PendingTransaction>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection.prepare("SELECT id, payload, hlc, expected_updated_at FROM sync_outbox WHERE status = 'PENDING' ORDER BY created_at ASC, id ASC")
        .map_err(|error| error.to_string())?;
    let records = statement.query_map([], |row| {
        let json: String = row.get(1)?;
        let payload = serde_json::from_str(&json).map_err(|error| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error)))?;
        Ok(PendingTransaction { id: row.get(0)?, payload, hlc: row.get(2)?, expected_updated_at: row.get(3)? })
    }).map_err(|error| error.to_string())?;
    records.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command]
fn local_outbox_count(app: tauri::AppHandle) -> Result<i64, String> {
    open_database(&app)?.query_row("SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'", [], |row| row.get(0))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn local_ack(app: tauri::AppHandle, ids: Vec<String>) -> Result<(), String> {
    if ids.len() > 10_000 || ids.iter().any(|id| id.len() > 80) { return Err("Invalid outbox acknowledgement.".into()); }
    let mut connection = open_database(&app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    for id in ids {
        transaction.execute("UPDATE sync_outbox SET status = 'SYNCED' WHERE id = ?1", [id]).map_err(|error| error.to_string())?;
    }
    transaction.execute("DELETE FROM sync_outbox WHERE status = 'SYNCED' AND created_at < ?1", [now_millis()?.saturating_sub(30 * 24 * 60 * 60 * 1000)])
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn system_diagnostics(app: tauri::AppHandle) -> Result<SystemDiagnostics, String> {
    let db_path = database_path(&app)?;
    let db_size_bytes = fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);
    let connection = open_database(&app)?;
    let pending_outbox_count = connection.query_row(
        "SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'",
        [],
        |row| row.get(0)
    ).map_err(|error| error.to_string())?;
    let database_cipher_version = connection.query_row(
        "PRAGMA cipher_version",
        [],
        |row| row.get::<_, String>(0)
    ).map_err(|error| format!("SQLCipher verification failed: {error}"))?;
    let uptime_seconds = PROCESS_START.get().map(|s| s.elapsed().as_secs()).unwrap_or(0);
    let hostname = env::var("COMPUTERNAME").or_else(|_| env::var("HOSTNAME")).unwrap_or_else(|_| "localhost".into());

    Ok(SystemDiagnostics {
        os_platform: env::consts::OS.to_string(),
        os_arch: env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        db_size_bytes,
        pending_outbox_count,
        uptime_seconds,
        hostname,
        database_encrypted: !database_cipher_version.trim().is_empty(),
        database_cipher_version,
    })
}

#[tauri::command]
fn network_ping(target_host: Option<String>) -> Result<NetworkPingResult, String> {
    let host = target_host.unwrap_or_else(|| "dxrkvljomgqffvrygbbw.supabase.co:443".to_string());
    let socket_addr = host.to_socket_addrs().map_err(|e| format!("DNS lookup failed: {e}"))?
        .next().ok_or_else(|| "Could not resolve hostname".to_string())?;

    let start = Instant::now();
    match TcpStream::connect_timeout(&socket_addr, Duration::from_millis(4000)) {
        Ok(_) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            Ok(NetworkPingResult {
                host,
                latency_ms,
                reachable: true,
                details: format!("Verified TCP connection in {}ms", latency_ms),
            })
        }
        Err(e) => Ok(NetworkPingResult {
            host,
            latency_ms: 0,
            reachable: false,
            details: format!("Connection timed out or failed: {e}"),
        }),
    }
}

#[tauri::command]
fn print_escpos_thermal(app: tauri::AppHandle, payload: ReceiptPrintPayload) -> Result<EscposPrintResult, String> {
    let mut bytes = Vec::new();

    // ESC @ - Initialize printer
    bytes.extend_from_slice(&[0x1B, 0x40]);

    // Center alignment
    bytes.extend_from_slice(&[0x1B, 0x61, 0x01]);

    // Double height & width for shop title
    bytes.extend_from_slice(&[0x1D, 0x21, 0x11]);
    bytes.extend_from_slice(payload.shop_name.as_bytes());
    bytes.push(0x0A);

    // Normal text
    bytes.extend_from_slice(&[0x1D, 0x21, 0x00]);
    if !payload.header.is_empty() {
        bytes.extend_from_slice(payload.header.as_bytes());
        bytes.push(0x0A);
    }
    if !payload.address.is_empty() {
        bytes.extend_from_slice(payload.address.as_bytes());
        bytes.push(0x0A);
    }
    if !payload.phone.is_empty() {
        bytes.extend_from_slice(format!("Tel: {}\n", payload.phone).as_bytes());
    }
    if !payload.tin.is_empty() {
        bytes.extend_from_slice(format!("TIN: {}\n", payload.tin).as_bytes());
    }

    // Divider
    bytes.extend_from_slice(b"--------------------------------\n");
    // Left alignment
    bytes.extend_from_slice(&[0x1B, 0x61, 0x00]);
    bytes.extend_from_slice(format!("Receipt: {}\n", payload.receipt_number).as_bytes());
    bytes.extend_from_slice(format!("Date: {}\n", payload.date).as_bytes());
    bytes.extend_from_slice(format!("Cashier: {}\n", payload.cashier).as_bytes());
    bytes.extend_from_slice(format!("Customer: {}\n", payload.customer).as_bytes());
    bytes.extend_from_slice(format!("Payment: {}\n", payload.payment_method).as_bytes());
    bytes.extend_from_slice(b"--------------------------------\n");

    // Items table
    bytes.extend_from_slice(format!("{:<16} {:>4} {:>10}\n", "Item", "Qty", "Total (FRw)").as_bytes());
    for item in payload.items {
        let name_trimmed = if item.name.len() > 16 { &item.name[..16] } else { &item.name };
        bytes.extend_from_slice(format!("{:<16} {:>4} {:>10.0}\n", name_trimmed, item.quantity, item.subtotal).as_bytes());
    }
    bytes.extend_from_slice(b"--------------------------------\n");

    // Totals
    // Right align
    bytes.extend_from_slice(&[0x1B, 0x61, 0x02]);
    if payload.discount > 0.0 {
        bytes.extend_from_slice(format!("Subtotal: FRw {:.0}\n", payload.subtotal).as_bytes());
        bytes.extend_from_slice(format!("Discount: -FRw {:.0}\n", payload.discount).as_bytes());
    }
    // Bold total
    bytes.extend_from_slice(&[0x1B, 0x45, 0x01]);
    bytes.extend_from_slice(format!("TOTAL: FRw {:.0}\n", payload.total).as_bytes());
    bytes.extend_from_slice(&[0x1B, 0x45, 0x00]);
    bytes.extend_from_slice(format!("Paid: FRw {:.0}\n", payload.paid).as_bytes());
    if payload.balance > 0.0 {
        bytes.extend_from_slice(format!("Balance Due: FRw {:.0}\n", payload.balance).as_bytes());
    }

    // Center alignment for footer
    bytes.extend_from_slice(&[0x1B, 0x61, 0x01]);
    bytes.extend_from_slice(b"--------------------------------\n");
    if !payload.footer.is_empty() {
        bytes.extend_from_slice(payload.footer.as_bytes());
        bytes.push(0x0A);
    }
    bytes.extend_from_slice(format!("Seal: {}\n", payload.seal).as_bytes());
    bytes.extend_from_slice(b"*** Thank you for your business ***\n");
    bytes.extend_from_slice(b"Powered by BeBoss Retail Operations\n\n\n");

    // Cut paper (GS V 66 0)
    bytes.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]);
    // Kick cash drawer (ESC p 0 25 250)
    bytes.extend_from_slice(&[0x1B, 0x70, 0x00, 0x19, 0xFA]);

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let spool_file = app_dir.join("thermal_receipt_spool.bin");
    fs::write(&spool_file, &bytes).map_err(|e| e.to_string())?;

    Ok(EscposPrintResult {
        success: true,
        base64_bytes: BASE64_STANDARD.encode(&bytes),
        spool_path: spool_file.to_string_lossy().to_string(),
        message: "ESC/POS receipt sequence successfully generated and spooled".to_string(),
    })
}

#[tauri::command]
fn export_backup_file(app: tauri::AppHandle, encrypted_content: String) -> Result<FileExportResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = app_dir.join("backups");
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    if encrypted_content.len() > 70_000_000 { return Err("Encrypted backup exceeds the 70 MB safety limit.".into()); }
    let envelope = encrypted_content.strip_prefix("BBPORTABLE1:").ok_or_else(|| "Backup must use the portable encrypted format.".to_string())?;
    serde_json::from_str::<Value>(envelope).map_err(|error| format!("Invalid encrypted backup envelope: {error}"))?;
    let filename = format!("beboss-backup-{}.bbbackup", now_millis()?);
    let target_file = backup_dir.join(filename);

    let bytes = encrypted_content.as_bytes();
    fs::write(&target_file, bytes).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = format!("{:X}", hasher.finalize());

    Ok(FileExportResult {
        success: true,
        file_path: target_file.to_string_lossy().to_string(),
        file_size_bytes: bytes.len(),
        sha256,
    })
}

#[tauri::command]
fn import_backup_file(file_path: String) -> Result<String, String> {
    let content = fs::read_to_string(&file_path).map_err(|e| format!("Could not read backup file: {e}"))?;
    if content.len() > 70_000_000 { return Err("Backup exceeds the 70 MB safety limit.".into()); }
    // Portable encrypted envelopes are decrypted in the renderer with the user's passphrase.
    // Legacy plaintext JSON remains readable for migration.
    Ok(content)
}

#[tauri::command]

fn main() {
    PROCESS_START.set(Instant::now()).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secure_get, secure_set, secure_remove, get_device_id,
            local_load, local_queue, local_pending, local_outbox_count, local_ack,
            system_diagnostics, network_ping, print_escpos_thermal,
            export_backup_file, import_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running BeBoss Desktop");
}


#[cfg(test)]
mod database_encryption_tests {
    use super::*;

    fn test_path(label: &str) -> PathBuf {
        let directory = env::temp_dir().join(format!(
            "beboss-sqlcipher-{}-{}",
            label,
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(&directory).expect("test directory should be created");
        directory.join("beboss-local.sqlite")
    }

    #[test]
    fn migrates_legacy_database_without_losing_records() {
        let path = test_path("migration");
        let legacy = Connection::open(&path).expect("legacy database should open");
        legacy.execute_batch(
            "CREATE TABLE retained_records (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO retained_records(value) VALUES ('shop-snapshot'), ('pending-outbox');"
        ).expect("legacy records should be written");
        drop(legacy);

        migrate_plaintext_database(&path, "test-database-key")
            .expect("legacy database should migrate");

        let encrypted = open_keyed_database(&path, "test-database-key")
            .expect("migrated SQLCipher database should open with its key");
        let count: i64 = encrypted.query_row(
            "SELECT COUNT(*) FROM retained_records",
            [],
            |row| row.get(0)
        ).expect("migrated rows should remain readable");
        assert_eq!(count, 2);
        drop(encrypted);

        let without_key = Connection::open(&path).expect("SQLCipher file handle should open");
        assert!(
            without_key.query_row("SELECT COUNT(*) FROM retained_records", [], |row| row.get::<_, i64>(0)).is_err(),
            "the migrated database must not be readable without its encryption key"
        );
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_a_wrong_database_key() {
        let path = test_path("wrong-key");
        let keyed = open_keyed_database(&path, "correct-key")
            .expect("new SQLCipher database should initialize");
        keyed.execute_batch("CREATE TABLE private_records (value TEXT NOT NULL);")
            .expect("test table should be created");
        drop(keyed);

        assert!(
            open_keyed_database(&path, "incorrect-key").is_err(),
            "a wrong key must not open the database"
        );
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }
}
