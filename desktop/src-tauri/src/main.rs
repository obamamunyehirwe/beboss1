#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Nonce};
use base64::prelude::*;
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use keyring::Entry;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{Read, Write},
    net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs, UdpSocket},
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(not(target_os = "windows"))]
use std::process::{Command, Stdio};
#[cfg(target_os = "windows")]
use std::ptr::null_mut;
use tauri::Manager;
use uuid::Uuid;

const KEYRING_SERVICE: &str = "com.beboss.desktop";
const KEYRING_DATABASE_KEY: &str = "database-encryption-key";
const KEYRING_DEVICE_ID_KEY: &str = "installation-device-id";
const DATABASE_KEY_BACKUP_FILE: &str = "beboss-local.sqlite.dpapi-key";
const DATABASE_KEY_DPAPI_ENTROPY: &[u8] = b"BeBoss Desktop SQLCipher master key v1";
const LAN_MAX_UNCOMPRESSED_BYTES: usize = 5 * 1024 * 1024;
#[cfg(target_os = "windows")]
#[repr(C)]
struct DataBlob { cb_data: u32, pb_data: *mut u8 }
#[cfg(target_os = "windows")]
#[link(name = "Crypt32")]
extern "system" {
 fn CryptProtectData(input:*const DataBlob,description:*const u16,entropy:*const DataBlob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut DataBlob)->i32;
 fn CryptUnprotectData(input:*const DataBlob,description:*mut *mut u16,entropy:*const DataBlob,reserved:*mut std::ffi::c_void,prompt:*mut std::ffi::c_void,flags:u32,output:*mut DataBlob)->i32;
}
#[cfg(target_os = "windows")]
#[link(name = "Kernel32")]
extern "system" { fn LocalFree(memory:*mut std::ffi::c_void)->*mut std::ffi::c_void; }
#[cfg(target_os = "windows")]
fn windows_dpapi_transform(value:&[u8],protect:bool)->Result<Vec<u8>,String>{
 use std::slice;
 if value.is_empty()||value.len()>4096{return Err("Invalid protected database-key payload size.".into());}
 let input=DataBlob{cb_data:value.len() as u32,pb_data:value.as_ptr() as *mut u8};
 let entropy=DataBlob{cb_data:DATABASE_KEY_DPAPI_ENTROPY.len() as u32,pb_data:DATABASE_KEY_DPAPI_ENTROPY.as_ptr() as *mut u8};
 let mut output=DataBlob{cb_data:0,pb_data:null_mut()};
 let description:Vec<u16>="BeBoss Desktop database key".encode_utf16().chain(Some(0)).collect();
 let ok=unsafe{if protect{CryptProtectData(&input,description.as_ptr(),&entropy,null_mut(),null_mut(),0x1,&mut output)}else{CryptUnprotectData(&input,null_mut(),&entropy,null_mut(),null_mut(),0x1,&mut output)}};
 if ok==0{return Err(format!("Windows DPAPI failed: {}",std::io::Error::last_os_error()));}
 if output.pb_data.is_null()||output.cb_data==0{return Err("Windows DPAPI returned an empty key payload.".into());}
 let value=unsafe{slice::from_raw_parts(output.pb_data,output.cb_data as usize).to_vec()};
 unsafe{LocalFree(output.pb_data as *mut std::ffi::c_void);}
 Ok(value)
}
fn database_key_backup_path(path:&std::path::Path)->PathBuf{path.with_file_name(DATABASE_KEY_BACKUP_FILE)}
fn load_database_key_backup(path:&std::path::Path)->Result<Option<String>,String>{
 #[cfg(target_os="windows")]{
  let file=database_key_backup_path(path);if !file.is_file(){return Ok(None);}
  let bytes=fs::read(file).map_err(|e|e.to_string())?;
  let plain=match windows_dpapi_transform(&bytes,false){Ok(v)=>v,Err(_)=>return Ok(None)};
  let key=String::from_utf8(plain).map_err(|_|"DPAPI key backup is not valid UTF-8.".to_string())?;
  if key.len()<32{return Err("DPAPI key backup has invalid length.".into());}Ok(Some(key))
 }
 #[cfg(not(target_os="windows"))]{let _=path;Ok(None)}
}
fn save_database_key_backup(path:&std::path::Path,key:&str)->Result<(),String>{
 #[cfg(target_os="windows")]{
  let bytes=windows_dpapi_transform(key.as_bytes(),true)?;
  let target=database_key_backup_path(path);let temp=target.with_extension("dpapi-key.tmp");
  fs::write(&temp,bytes).map_err(|e|e.to_string())?;
  if target.exists(){fs::remove_file(&target).map_err(|e|e.to_string())?;}
  fs::rename(&temp,&target).map_err(|e|e.to_string())?;
 }
 #[cfg(not(target_os="windows"))]{let _=(path,key);}
 Ok(())
}

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
    let has_valid_name = !key.is_empty()
        && key.len() <= 180
        && key.bytes().all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b'.' | b':'));
    if !has_valid_name {
        return false;
    }

    // The only renderer-accessible "shop-" namespace is the encrypted per-owner
    // cache. All other internal shop/device credential keys remain reserved.
    let is_scoped_shop_cache = key
        .strip_prefix("shop-cache:")
        .is_some_and(|owner| !owner.is_empty() && owner.len() <= 120 && !owner.contains(':'));
    is_scoped_shop_cache || !is_reserved_key(key)
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

fn is_readable_legacy_plaintext_database(path: &std::path::Path) -> bool {
    Connection::open(path)
        .and_then(|legacy| {
            legacy.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get::<_, i64>(0))
        })
        .is_ok()
}

/// A missing key may be generated only for a new database or a readable legacy
/// plaintext SQLite file that can be migrated. Never replace a lost key for an
/// existing encrypted/corrupt database: doing so would strand its cache and outbox.
fn may_generate_database_key(path: &std::path::Path) -> bool {
    match fs::metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
        Ok(metadata) if metadata.len() == 0 => true,
        Ok(_) => is_readable_legacy_plaintext_database(path),
    }
}

fn database_key(path:&std::path::Path)->Result<String,String>{
 let entry=Entry::new(KEYRING_SERVICE,KEYRING_DATABASE_KEY).map_err(|e|format!("Could not open OS credential vault: {e}"))?;
 match entry.get_password(){
  Ok(key)=>Ok(key),
  Err(keyring::Error::NoEntry)=>{
   if let Some(backup)=load_database_key_backup(path)?{
    let exists=fs::metadata(path).map(|m|m.len()>0).unwrap_or(false);
    if !exists||open_keyed_database(path,&backup).is_ok(){
     entry.set_password(&backup).map_err(|e|format!("Recovered key could not be restored to Credential Manager: {e}"))?;
     return Ok(backup);
    }
   }
   if !may_generate_database_key(path){
    return Err("BeBoss found an existing encrypted local database, but its key is missing from Credential Manager and no usable Windows-profile recovery key was found. The database and pending sync queue were not modified. Keep this Windows profile intact and restore the original credential profile or a trusted BeBoss recovery key before replacing the local cache.".into());
   }
   let key=Uuid::new_v4().simple().to_string()+&Uuid::new_v4().simple().to_string();
   entry.set_password(&key).map_err(|e|format!("Could not persist database key in Credential Manager: {e}"))?;
   save_database_key_backup(path,&key).map_err(|e|format!("DPAPI backup failed: {e}"))?;
   Ok(key)
  }
  Err(error)=>Err(format!("The operating-system credential vault is unavailable; local database was not opened: {error}")),
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

fn validate_shop_scope(shop_sync_key: &str) -> Result<&str, String> {
    let clean = shop_sync_key.trim();
    if !(8..=120).contains(&clean.len())
        || !clean.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("A valid registered shop identity is required for local sync storage.".into());
    }
    Ok(clean)
}

fn scoped_snapshot_key(shop_sync_key: &str) -> Result<String, String> {
    Ok(format!("snapshot:{}", validate_shop_scope(shop_sync_key)?))
}

fn scoped_hlc_key(shop_sync_key: &str) -> Result<String, String> {
    Ok(format!("last-hlc:{}", validate_shop_scope(shop_sync_key)?))
}

fn ensure_sync_outbox_tenant_column(connection: &Connection) -> Result<(), String> {
    // Old outbox rows receive tenant_id='' and stay quarantined: they are never
    // replayed into an arbitrary account after an owner switches shops.
    let has_tenant_id = {
        let mut statement = connection.prepare("PRAGMA table_info(sync_outbox)")
            .map_err(|error| error.to_string())?;
        let columns = statement.query_map([], |row| row.get::<_, String>(1))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        columns.iter().any(|column| column == "tenant_id")
    };
    if !has_tenant_id {
        connection.execute_batch("ALTER TABLE sync_outbox ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '';")
            .map_err(|error| format!("Could not safely add shop-scoped offline queue metadata: {error}"))?;
    }
    connection.execute_batch(
        "CREATE INDEX IF NOT EXISTS sync_outbox_tenant_ready ON sync_outbox(tenant_id, status, created_at);"
    ).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_database(app:&tauri::AppHandle)->Result<Connection,String>{
 let path=database_path(&app)?;let mut key_seed=database_key(&path)?;
 let exists=path.metadata().map(|m|m.len()>0).unwrap_or(false);
 let connection=if exists{
  match open_keyed_database(&path,&key_seed){
   Ok(db)=>db,
   Err(error)=>{
    let mut recovered=None;
    if let Some(backup)=load_database_key_backup(&path)?{
     if backup!=key_seed{
      if let Ok(db)=open_keyed_database(&path,&backup){
       key_seed=backup;
       if let Ok(entry)=Entry::new(KEYRING_SERVICE,KEYRING_DATABASE_KEY){let _=entry.set_password(&key_seed);}
       recovered=Some(db);
      }
     }
    }
    if let Some(db)=recovered{db}else{
     if !is_readable_legacy_plaintext_database(&path){return Err(format!("BeBoss could not unlock its SQLCipher database. Original files were not changed. Credential Manager and the Windows-profile recovery key did not unlock it. ({error})"));}
     migrate_plaintext_database(&path,&key_seed)?;open_keyed_database(&path,&key_seed)?
    }
   }
  }
 }else{open_keyed_database(&path,&key_seed)?};
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
             tenant_id TEXT NOT NULL DEFAULT '',
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

    ensure_sync_outbox_tenant_column(&connection)?;
    if let Err(error)=save_database_key_backup(&path,&key_seed){eprintln!("[BeBoss] DPAPI key backup refresh failed: {error}");}
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
    #[serde(rename = "oldestPendingAt")]
    oldest_pending_at: Option<i64>,
    #[serde(rename = "uptimeSeconds")]
    uptime_seconds: u64,
    hostname: String,
    #[serde(rename = "databaseEncrypted")]
    database_encrypted: bool,
    #[serde(rename = "databaseCipherVersion")]
    database_cipher_version: String,
    #[serde(rename = "databaseIntegrity")]
    database_integrity: String,
    #[serde(rename = "journalMode")]
    journal_mode: String,
    #[serde(rename = "defaultPrinterName")]
    default_printer_name: Option<String>,
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
    #[serde(rename = "printerName")]
    printer_name: String,
    #[serde(rename = "jobId")]
    job_id: String,
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
            let path = database_path(&app)?;
            let key_seed = database_key(&path)?;
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
    let path = database_path(&app)?;
    let key_seed = database_key(&path)?;
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
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_DEVICE_ID_KEY)
        .map_err(|error| format!("Could not open the operating-system device identity vault: {error}"))?;
    match entry.get_password() {
        Ok(device_id) => {
            Uuid::parse_str(&device_id)
                .map_err(|_| "The protected desktop device identity is malformed; do not register this installation until it is repaired.".to_string())?;
            return Ok(device_id);
        }
        Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(format!("The operating-system device identity vault is unavailable: {error}")),
    }

    // Migrate the identity from older desktop versions when their database still
    // opens. If it cannot be read, issue a new protected identity so the owner can
    // explicitly re-enrol this recovered installation with BeBoss Cloud.
    let legacy_device_id = open_database(&app).ok().and_then(|connection| {
        connection.query_row(
            "SELECT value FROM local_state WHERE key = 'desktop-device-id'",
            [],
            |row| row.get::<_, String>(0)
        ).optional().ok().flatten()
    });
    let device_id = legacy_device_id
        .filter(|value| Uuid::parse_str(value).is_ok())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    entry.set_password(&device_id)
        .map_err(|error| format!("Could not persist the desktop device identity in the operating-system vault: {error}"))?;
    Ok(device_id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalDatabaseRecoveryResult {
    backup_path: String,
    archived_files: Vec<String>,
    recovery_key_reference: Option<String>,
}

/// Explicitly quarantine an unreadable local cache before creating a fresh SQLCipher
/// store. This command never runs automatically: the user must confirm in setup.
/// The old DB/WAL/SHM files are retained in the recovery folder, and an available old
/// key is copied into a separate OS-vault entry so support can recover it later.
#[tauri::command]
fn recover_local_database(app: tauri::AppHandle) -> Result<LocalDatabaseRecoveryResult, String> {
    let app_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    let db_path = database_path(&app)?;
    let timestamp = now_millis()?;
    let backup_dir = app_dir.join("recovery").join(format!("locked-cache-{timestamp}"));
    fs::create_dir_all(&backup_dir).map_err(|error| format!("Could not create the local recovery folder: {error}"))?;

    let key_entry = Entry::new(KEYRING_SERVICE, KEYRING_DATABASE_KEY)
        .map_err(|error| format!("Could not access the operating-system database key vault: {error}"))?;
    let old_key=match key_entry.get_password(){
        Ok(value)=>Some(value),
        Err(keyring::Error::NoEntry)=>load_database_key_backup(&db_path)?,
        Err(error)=>return Err(format!("The existing local database key could not be read safely: {error}")),
    };
    let recovery_key_reference = old_key.as_ref().map(|_| format!("database-recovery-key-{timestamp}"));
    if let (Some(old_key), Some(reference)) = (old_key.as_ref(), recovery_key_reference.as_ref()) {
        Entry::new(KEYRING_SERVICE, reference)
            .and_then(|entry| entry.set_password(old_key))
            .map_err(|error| format!("The original database key could not be preserved in the operating-system vault; recovery was cancelled: {error}"))?;
    }

    let mut moved_files: Vec<(PathBuf, PathBuf)> = Vec::new();
    for source in [
        db_path.clone(),
        db_path.with_extension("sqlite-wal"),
        db_path.with_extension("sqlite-shm"),
    ] {
        if !source.exists() { continue; }
        let filename = source.file_name()
            .ok_or_else(|| "A local database recovery file has no valid name.".to_string())?;
        let destination = backup_dir.join(filename);
        if let Err(error) = fs::rename(&source, &destination) {
            for (original, archived) in moved_files.iter().rev() {
                let _ = fs::rename(archived, original);
            }
            return Err(format!("Could not quarantine the existing local database safely; no replacement cache was created: {error}"));
        }
        moved_files.push((source, destination));
    }

    let archived_files = moved_files.iter()
        .map(|(_, archived)| archived.to_string_lossy().to_string())
        .collect::<Vec<_>>();
    let manifest = serde_json::json!({
        "createdAt": timestamp,
        "originalDatabasePath": db_path.to_string_lossy(),
        "archivedFiles": archived_files,
        "recoveryKeyReference": recovery_key_reference,
        "note": "This is a quarantined SQLCipher database and retry queue. It is not a verified cloud backup. Restore only with the matching original key."
    });
    let manifest_path = backup_dir.join("manifest.json");
    if let Err(error) = fs::write(&manifest_path, serde_json::to_vec_pretty(&manifest).map_err(|e| e.to_string())?) {
        for (original, archived) in moved_files.iter().rev() {
            let _ = fs::rename(archived, original);
        }
        return Err(format!("Could not write the local recovery manifest; the original files were returned to their original location: {error}"));
    }

    let new_key = Uuid::new_v4().simple().to_string() + &Uuid::new_v4().simple().to_string();
    if let Err(error) = key_entry.set_password(&new_key) {
        for (original, archived) in moved_files.iter().rev() {
            let _ = fs::rename(archived, original);
        }
        return Err(format!("Could not provision a new local cache key; the original files were returned to their original location: {error}"));
    }

    if let Err(error)=save_database_key_backup(&db_path,&new_key){
        return Err(format!("Original files remain preserved at {}. DPAPI failed for the new cache key: {error}",backup_dir.to_string_lossy()));
    }
    // The old files remain quarantined. A successful open creates a new empty
    // encrypted cache; the owner then signs in and restores authoritative business
    // records from Supabase or a verified phone/device snapshot.
    match open_database(&app) {
        Ok(connection) => drop(connection),
        Err(error) => {
            return Err(format!(
                "The old local files are preserved at {} but a new encrypted cache could not be initialized: {error}",
                backup_dir.to_string_lossy()
            ));
        }
    }

    Ok(LocalDatabaseRecoveryResult {
        backup_path: backup_dir.to_string_lossy().to_string(),
        archived_files,
        recovery_key_reference,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn local_load(app: tauri::AppHandle, shop_sync_key: String) -> Result<Option<Value>, String> {
    let snapshot_key = scoped_snapshot_key(&shop_sync_key)?;
    let connection = open_database(&app)?;
    let value = connection.query_row("SELECT value FROM local_state WHERE key = ?1", [snapshot_key], |row| row.get::<_, String>(0))
        .optional().map_err(|error| error.to_string())?;
    value.map(|json| serde_json::from_str(&json).map_err(|error| error.to_string())).transpose()
}

#[tauri::command(rename_all = "camelCase")]
fn local_save_baseline(
    app: tauri::AppHandle,
    shop_sync_key: String,
    snapshot: Value,
    snapshot_updated_at: i64,
) -> Result<(), String> {
    let snapshot_key = scoped_snapshot_key(&shop_sync_key)?;
    if snapshot_updated_at < 0 || !snapshot.is_object() ||
        !snapshot.get("metadata").is_some_and(Value::is_object)
    {
        return Err("The verified cloud snapshot is incomplete.".into());
    }
    let serialized = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;
    let connection = open_database(&app)?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    let pending: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM sync_outbox WHERE tenant_id = ?1 AND status = 'PENDING'",
        [&shop_sync_key],
        |row| row.get(0)
    ).map_err(|error| error.to_string())?;
    if pending > 0 {
        return Err("A newer local transaction is still pending; the verified baseline was not allowed to replace it.".into());
    }
    transaction.execute(
        "INSERT INTO local_state(key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![snapshot_key, serialized, snapshot_updated_at]
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
fn local_queue(
    app: tauri::AppHandle,
    shop_sync_key: String,
    operation: String,
    mut payload: Value,
    device_id: String,
    expected_updated_at: i64,
    requires_active_subscription: bool,
    subscription_expires_at: i64,
    subscription_status: String,
) -> Result<PendingTransaction, String> {
    validate_shop_scope(&shop_sync_key)?;
    let snapshot_key = scoped_snapshot_key(&shop_sync_key)?;
    let hlc_key = scoped_hlc_key(&shop_sync_key)?;
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
    let prior_outbox_hlc: Option<i64> = connection.query_row(
        "SELECT MAX(hlc) FROM sync_outbox WHERE tenant_id = ?1 AND status = 'PENDING'",
        [&shop_sync_key], |row| row.get(0)
    ).map_err(|error| error.to_string())?;
    let prior_saved_hlc: Option<String> = connection.query_row(
        "SELECT value FROM local_state WHERE key = ?1", [&hlc_key], |row| row.get(0)
    ).optional().map_err(|error| error.to_string())?;
    let prior_hlc = prior_outbox_hlc.into_iter().chain(prior_saved_hlc.and_then(|value| value.parse::<i64>().ok())).max();
    let wall_hlc = now.checked_shl(16).ok_or_else(|| "Clock value is out of range.".to_string())?;
    let hlc = wall_hlc.max(prior_hlc.unwrap_or(0).saturating_add(1));
    stamp_desktop_records(&mut payload, hlc, now.saturating_sub(60_000), &device_id);
    let id = Uuid::new_v4().to_string();
    let serialized = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
    let transaction = connection.unchecked_transaction().map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO local_state(key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![snapshot_key, serialized, now]
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO local_state(key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![hlc_key, hlc.to_string(), now]
    ).map_err(|error| error.to_string())?;
    transaction.execute(
        "INSERT INTO sync_outbox(id, operation, payload, hlc, device_id, tenant_id, expected_updated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, operation, serialized, hlc, device_id, shop_sync_key, expected_updated_at, now]
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(PendingTransaction { id, payload, hlc, expected_updated_at })
}

#[tauri::command(rename_all = "camelCase")]
fn local_pending(app: tauri::AppHandle, shop_sync_key: String) -> Result<Vec<PendingTransaction>, String> {
    validate_shop_scope(&shop_sync_key)?;
    let connection = open_database(&app)?;
    let mut statement = connection.prepare(
        "SELECT id, payload, hlc, expected_updated_at FROM sync_outbox WHERE status = 'PENDING' AND tenant_id = ?1 ORDER BY created_at ASC, id ASC"
    ).map_err(|error| error.to_string())?;
    let records = statement.query_map([shop_sync_key], |row| {
        let json: String = row.get(1)?;
        let payload = serde_json::from_str(&json).map_err(|error| rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(error)))?;
        Ok(PendingTransaction { id: row.get(0)?, payload, hlc: row.get(2)?, expected_updated_at: row.get(3)? })
    }).map_err(|error| error.to_string())?;
    records.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
fn local_outbox_count(app: tauri::AppHandle, shop_sync_key: Option<String>) -> Result<i64, String> {
    let connection = open_database(&app)?;
    match shop_sync_key {
        Some(shop) => {
            validate_shop_scope(&shop)?;
            connection.query_row(
                "SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING' AND tenant_id = ?1",
                [shop], |row| row.get(0)
            ).map_err(|error| error.to_string())
        }
        None => connection.query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'",
            [], |row| row.get(0)
        ).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn local_unassigned_outbox_count(app: tauri::AppHandle) -> Result<i64, String> {
    open_database(&app)?.query_row(
        "SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING' AND tenant_id = ''",
        [], |row| row.get(0)
    ).map_err(|error| error.to_string())
}

#[tauri::command(rename_all = "camelCase")]
fn local_ack(app: tauri::AppHandle, shop_sync_key: String, ids: Vec<String>) -> Result<(), String> {
    validate_shop_scope(&shop_sync_key)?;
    if ids.len() > 10_000 || ids.iter().any(|id| id.len() > 80) { return Err("Invalid outbox acknowledgement.".into()); }
    let mut connection = open_database(&app)?;
    let transaction = connection.transaction().map_err(|error| error.to_string())?;
    for id in ids {
        transaction.execute("UPDATE sync_outbox SET status = 'SYNCED' WHERE id = ?1 AND tenant_id = ?2", params![id, shop_sync_key])
            .map_err(|error| error.to_string())?;
    }
    transaction.execute(
        "DELETE FROM sync_outbox WHERE status = 'SYNCED' AND created_at < ?1",
        [now_millis()?.saturating_sub(30 * 24 * 60 * 60 * 1000)]
    ).map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn database_integrity_check(connection: &Connection) -> Result<String, String> {
    let result = connection.query_row("PRAGMA quick_check(1)", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("SQLCipher database integrity check failed: {error}"))?;
    if !result.eq_ignore_ascii_case("ok") {
        return Err(format!("SQLCipher database integrity check reported corruption: {result}"));
    }
    Ok(result)
}

fn database_storage_bytes(db_path: &std::path::Path) -> u64 {
    [
        db_path.to_path_buf(),
        db_path.with_extension("sqlite-wal"),
        db_path.with_extension("sqlite-shm"),
    ]
    .iter()
    .filter_map(|path| fs::metadata(path).ok().map(|metadata| metadata.len()))
    .fold(0u64, u64::saturating_add)
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
struct SetupPreflight{os_platform:String,os_arch:String,app_version:String,database_state:String,database_message:String,database_path:String,database_size_bytes:u64,pending_outbox_count:Option<i64>,recovery_archive_count:usize,dpapi_backup_available:bool}
#[tauri::command]
fn setup_preflight(app:tauri::AppHandle)->Result<SetupPreflight,String>{
 let path=database_path(&app)?;let size=database_storage_bytes(&path);
 let(state,message,pending)=match open_database(&app){
  Ok(db)=>{let n=db.query_row("SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING'",[],|row|row.get::<_,i64>(0)).unwrap_or(0);("ready".to_string(),String::new(),Some(n))},
  Err(e)=>("locked".to_string(),e,None)
 };
 let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
 let archives=fs::read_dir(dir.join("recovery")).ok().into_iter().flatten().filter_map(Result::ok).filter(|e|e.file_type().map(|t|t.is_dir()).unwrap_or(false)).count();
 let dpapi=load_database_key_backup(&path).ok().flatten().is_some();
 Ok(SetupPreflight{os_platform:env::consts::OS.to_string(),os_arch:env::consts::ARCH.to_string(),app_version:env!("CARGO_PKG_VERSION").to_string(),database_state:state,database_message:message,database_path:path.to_string_lossy().to_string(),database_size_bytes:size,pending_outbox_count:pending,recovery_archive_count:archives,dpapi_backup_available:dpapi})
}
#[tauri::command]
fn test_credential_vault()->Result<(),String>{
 let name=format!("setup-probe-{}",Uuid::new_v4().simple());let expected=Uuid::new_v4().simple().to_string();
 let entry=Entry::new(KEYRING_SERVICE,&name).map_err(|e|format!("Could not open OS credential vault: {e}"))?;
 entry.set_password(&expected).map_err(|e|format!("Credential vault write failed: {e}"))?;
 let read=entry.get_password();let cleanup=entry.delete_credential();
 let value=read.map_err(|e|format!("Credential vault read failed: {e}"))?;
 if value!=expected{let _=cleanup;return Err("Credential vault returned a different value.".into());}
 cleanup.map_err(|e|format!("Credential vault cleanup failed: {e}"))?;Ok(())
}
#[tauri::command]
fn system_diagnostics(app: tauri::AppHandle) -> Result<SystemDiagnostics, String> {
    let db_path = database_path(&app)?;
    let connection = open_database(&app)?;
    let db_size_bytes = database_storage_bytes(&db_path);
    let pending_outbox_count = connection.query_row(
        "SELECT COUNT(*) FROM sync_outbox WHERE status = 'PENDING'",
        [],
        |row| row.get(0)
    ).map_err(|error| error.to_string())?;
    let oldest_pending_at = connection.query_row(
        "SELECT MIN(created_at) FROM sync_outbox WHERE status = 'PENDING'",
        [],
        |row| row.get::<_, Option<i64>>(0)
    ).map_err(|error| error.to_string())?;
    let database_cipher_version = connection.query_row(
        "PRAGMA cipher_version",
        [],
        |row| row.get::<_, String>(0)
    ).map_err(|error| format!("SQLCipher verification failed: {error}"))?;
    if database_cipher_version.trim().is_empty() {
        return Err("SQLCipher did not report an active database cipher.".into());
    }
    let database_integrity = database_integrity_check(&connection)?;
    let journal_mode = connection.query_row(
        "PRAGMA journal_mode",
        [],
        |row| row.get::<_, String>(0)
    ).map_err(|error| format!("Could not verify the desktop database journal mode: {error}"))?;
    let uptime_seconds = PROCESS_START.get().map(|s| s.elapsed().as_secs()).unwrap_or(0);
    let hostname = env::var("COMPUTERNAME").or_else(|_| env::var("HOSTNAME")).unwrap_or_else(|_| "localhost".into());

    Ok(SystemDiagnostics {
        os_platform: env::consts::OS.to_string(),
        os_arch: env::consts::ARCH.to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        db_path: db_path.to_string_lossy().to_string(),
        db_size_bytes,
        pending_outbox_count,
        oldest_pending_at,
        uptime_seconds,
        hostname,
        database_encrypted: true,
        database_cipher_version,
        database_integrity,
        journal_mode,
        default_printer_name: default_printer_name().ok(),
    })
}

#[tauri::command]
fn network_ping(target_host: Option<String>) -> Result<NetworkPingResult, String> {
    let host = target_host.unwrap_or_else(|| "ahlpvlhmpfiyeoercxol.supabase.co:443".to_string());
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

#[cfg(target_os = "windows")]
#[repr(C)]
struct DocInfo1W {
    document_name: *const u16,
    output_file: *const u16,
    data_type: *const u16,
}

#[cfg(target_os = "windows")]
#[link(name = "winspool")]
unsafe extern "system" {
    fn GetDefaultPrinterW(printer_name: *mut u16, buffer_chars: *mut u32) -> i32;
    fn OpenPrinterW(printer_name: *const u16, printer_handle: *mut *mut std::ffi::c_void, defaults: *mut std::ffi::c_void) -> i32;
    fn StartDocPrinterW(printer_handle: *mut std::ffi::c_void, level: u32, document_info: *const DocInfo1W) -> u32;
    fn StartPagePrinter(printer_handle: *mut std::ffi::c_void) -> i32;
    fn WritePrinter(printer_handle: *mut std::ffi::c_void, buffer: *const std::ffi::c_void, bytes: u32, written: *mut u32) -> i32;
    fn EndPagePrinter(printer_handle: *mut std::ffi::c_void) -> i32;
    fn EndDocPrinter(printer_handle: *mut std::ffi::c_void) -> i32;
    fn AbortPrinter(printer_handle: *mut std::ffi::c_void) -> i32;
    fn ClosePrinter(printer_handle: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "windows")]
fn default_printer_name() -> Result<String, String> {
    let mut required_chars = 0u32;
    unsafe {
        // The first call intentionally obtains the required buffer length.
        let _ = GetDefaultPrinterW(null_mut(), &mut required_chars);
    }
    if required_chars == 0 {
        return Err("Windows has no default printer configured. Set an ESC/POS printer as the default in Settings > Bluetooth & devices > Printers & scanners.".into());
    }

    let mut buffer = vec![0u16; required_chars as usize];
    let ok = unsafe { GetDefaultPrinterW(buffer.as_mut_ptr(), &mut required_chars) };
    if ok == 0 {
        return Err(format!("Windows could not read the default printer: {}", std::io::Error::last_os_error()));
    }
    let end = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    let name = String::from_utf16(&buffer[..end])
        .map_err(|error| format!("The default printer name is invalid UTF-16: {error}"))?;
    if name.trim().is_empty() {
        return Err("Windows returned an empty default printer name.".into());
    }
    Ok(name)
}

#[cfg(not(target_os = "windows"))]
fn default_printer_name() -> Result<String, String> {
    let output = Command::new("lpstat")
        .arg("-d")
        .output()
        .map_err(|error| format!("CUPS lpstat is unavailable. Install and configure a system printer first: {error}"))?;
    if !output.status.success() {
        return Err(format!("CUPS could not read the default printer: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let response = String::from_utf8_lossy(&output.stdout);
    let name = response
        .lines()
        .find_map(|line| line.strip_prefix("system default destination:"))
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "No default system printer is configured. Add an ESC/POS printer in the operating system's printer settings.".to_string())?;
    Ok(name.to_string())
}

#[cfg(target_os = "windows")]
fn submit_raw_escpos(printer_name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() || bytes.len() > u32::MAX as usize {
        return Err("The ESC/POS receipt payload is empty or too large for the Windows print spooler.".into());
    }

    let printer_name_wide: Vec<u16> = printer_name.encode_utf16().chain(std::iter::once(0)).collect();
    let document_name: Vec<u16> = "BeBoss POS receipt".encode_utf16().chain(std::iter::once(0)).collect();
    let raw_type: Vec<u16> = "RAW".encode_utf16().chain(std::iter::once(0)).collect();
    let document = DocInfo1W {
        document_name: document_name.as_ptr(),
        output_file: null_mut(),
        data_type: raw_type.as_ptr(),
    };

    let mut printer_handle: *mut std::ffi::c_void = null_mut();
    let opened = unsafe { OpenPrinterW(printer_name_wide.as_ptr(), &mut printer_handle, null_mut()) };
    if opened == 0 {
        return Err(format!("Windows could not open printer '{printer_name}': {}", std::io::Error::last_os_error()));
    }

    let job_id = unsafe {
        StartDocPrinterW(printer_handle, 1, &document)
    };
    if job_id == 0 {
        let error = std::io::Error::last_os_error();
        unsafe { ClosePrinter(printer_handle); }
        return Err(format!("Windows could not create a RAW print job for '{printer_name}': {error}"));
    }

    let mut page_started = false;
    let mut document_started = true;
    let result = (|| -> Result<String, String> {
        if unsafe { StartPagePrinter(printer_handle) } == 0 {
            return Err(format!("Windows could not start the receipt page: {}", std::io::Error::last_os_error()));
        }
        page_started = true;

        let mut offset = 0usize;
        while offset < bytes.len() {
            let mut written = 0u32;
            let remaining = (bytes.len() - offset) as u32;
            let ok = unsafe {
                WritePrinter(
                    printer_handle,
                    bytes[offset..].as_ptr() as *const std::ffi::c_void,
                    remaining,
                    &mut written,
                )
            };
            if ok == 0 || written == 0 {
                return Err(format!("Windows stopped accepting receipt bytes after {offset} of {} bytes: {}", bytes.len(), std::io::Error::last_os_error()));
            }
            offset += written as usize;
        }

        if unsafe { EndPagePrinter(printer_handle) } == 0 {
            return Err(format!("Windows could not finish the receipt page: {}", std::io::Error::last_os_error()));
        }
        page_started = false;

        if unsafe { EndDocPrinter(printer_handle) } == 0 {
            return Err(format!("Windows could not submit the receipt job: {}", std::io::Error::last_os_error()));
        }
        document_started = false;
        Ok(job_id.to_string())
    })();

    if result.is_err() && document_started {
        unsafe {
            if page_started { let _ = EndPagePrinter(printer_handle); }
            let _ = AbortPrinter(printer_handle);
        }
    }
    unsafe { ClosePrinter(printer_handle); }
    result
}

#[cfg(not(target_os = "windows"))]
fn submit_raw_escpos(printer_name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("The ESC/POS receipt payload is empty.".into());
    }
    let mut child = Command::new("lp")
        .arg("-d")
        .arg(printer_name)
        .arg("-o")
        .arg("raw")
        .arg("-t")
        .arg("BeBoss POS receipt")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("CUPS lp is unavailable. Install a supported printer queue first: {error}"))?;

    let write_result = child.stdin.take()
        .ok_or_else(|| "Could not open the CUPS print-job input stream.".to_string())?
        .write_all(bytes);
    if let Err(error) = write_result {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("Could not send the ESC/POS receipt to CUPS: {error}"));
    }
    let output = child.wait_with_output()
        .map_err(|error| format!("Could not collect the CUPS print-job result: {error}"))?;
    if !output.status.success() {
        return Err(format!("CUPS rejected the ESC/POS print job: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    let request = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if request.is_empty() {
        return Err("CUPS accepted the print command but did not return a job identifier.".into());
    }
    Ok(request)
}

fn encode_escpos_receipt(payload: ReceiptPrintPayload) -> Vec<u8> {
    let mut bytes = Vec::new();

    // ESC @ - Initialize printer
    bytes.extend_from_slice(&[0x1B, 0x40]);
    bytes.extend_from_slice(&[0x1B, 0x61, 0x01]);
    bytes.extend_from_slice(&[0x1D, 0x21, 0x11]);
    bytes.extend_from_slice(payload.shop_name.as_bytes());
    bytes.push(0x0A);

    bytes.extend_from_slice(&[0x1D, 0x21, 0x00]);
    if !payload.header.is_empty() { bytes.extend_from_slice(payload.header.as_bytes()); bytes.push(0x0A); }
    if !payload.address.is_empty() { bytes.extend_from_slice(payload.address.as_bytes()); bytes.push(0x0A); }
    if !payload.phone.is_empty() { bytes.extend_from_slice(format!("Tel: {}\n", payload.phone).as_bytes()); }
    if !payload.tin.is_empty() { bytes.extend_from_slice(format!("TIN: {}\n", payload.tin).as_bytes()); }

    bytes.extend_from_slice(b"--------------------------------\n");
    bytes.extend_from_slice(&[0x1B, 0x61, 0x00]);
    bytes.extend_from_slice(format!("Receipt: {}\n", payload.receipt_number).as_bytes());
    bytes.extend_from_slice(format!("Date: {}\n", payload.date).as_bytes());
    bytes.extend_from_slice(format!("Cashier: {}\n", payload.cashier).as_bytes());
    bytes.extend_from_slice(format!("Customer: {}\n", payload.customer).as_bytes());
    bytes.extend_from_slice(format!("Payment: {}\n", payload.payment_method).as_bytes());
    bytes.extend_from_slice(b"--------------------------------\n");
    bytes.extend_from_slice(format!("{:<16} {:>4} {:>10}\n", "Item", "Qty", "Total (FRw)").as_bytes());
    for item in payload.items {
        let name = item.name.chars().take(16).collect::<String>();
        bytes.extend_from_slice(format!("{:<16} {:>4} {:>10.0}\n", name, item.quantity, item.subtotal).as_bytes());
    }
    bytes.extend_from_slice(b"--------------------------------\n");
    bytes.extend_from_slice(&[0x1B, 0x61, 0x02]);
    if payload.discount > 0.0 {
        bytes.extend_from_slice(format!("Subtotal: FRw {:.0}\n", payload.subtotal).as_bytes());
        bytes.extend_from_slice(format!("Discount: -FRw {:.0}\n", payload.discount).as_bytes());
    }
    bytes.extend_from_slice(&[0x1B, 0x45, 0x01]);
    bytes.extend_from_slice(format!("TOTAL: FRw {:.0}\n", payload.total).as_bytes());
    bytes.extend_from_slice(&[0x1B, 0x45, 0x00]);
    bytes.extend_from_slice(format!("Paid: FRw {:.0}\n", payload.paid).as_bytes());
    if payload.balance > 0.0 { bytes.extend_from_slice(format!("Balance Due: FRw {:.0}\n", payload.balance).as_bytes()); }

    bytes.extend_from_slice(&[0x1B, 0x61, 0x01]);
    bytes.extend_from_slice(b"--------------------------------\n");
    if !payload.footer.is_empty() { bytes.extend_from_slice(payload.footer.as_bytes()); bytes.push(0x0A); }
    bytes.extend_from_slice(format!("Seal: {}\n", payload.seal).as_bytes());
    bytes.extend_from_slice(b"*** Thank you for your business ***\n");
    bytes.extend_from_slice(b"Powered by BeBoss Retail Operations\n\n\n");
    bytes.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]);
    bytes.extend_from_slice(&[0x1B, 0x70, 0x00, 0x19, 0xFA]);


    bytes
}

#[tauri::command]
fn print_escpos_thermal(app: tauri::AppHandle, payload: ReceiptPrintPayload) -> Result<EscposPrintResult, String> {
    let bytes = encode_escpos_receipt(payload);
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let spool_file = app_dir.join("thermal_receipt_spool.bin");
    fs::write(&spool_file, &bytes)
        .map_err(|error| format!("Could not preserve the ESC/POS spool artifact: {error}"))?;

    let printer_name = default_printer_name().map_err(|error| {
        format!("{error} The generated receipt bytes were preserved at {}.", spool_file.display())
    })?;
    let job_id = submit_raw_escpos(&printer_name, &bytes).map_err(|error| {
        format!("{error} The generated receipt bytes were preserved at {}.", spool_file.display())
    })?;

    Ok(EscposPrintResult {
        success: true,
        base64_bytes: BASE64_STANDARD.encode(&bytes),
        spool_path: spool_file.to_string_lossy().to_string(),
        printer_name: printer_name.clone(),
        job_id: job_id.clone(),
        message: format!("RAW ESC/POS receipt job {job_id} was submitted to '{printer_name}'. The operating-system queue accepted the job; verify paper output on the printer."),
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

// Backup import is intentionally handled from a user-selected browser File in the
// renderer. Do not expose an arbitrary-path filesystem read command to web content.


#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LanHub {
    id: String,
    shop_name: String,
    branch_name: String,
    ip_address: String,
    port: u16,
    products_count: u64,
    sales_count: u64,
    branches_count: u64,
    last_seen_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LanSyncResult {
    success: bool,
    peer_ip: String,
    pushed_records: usize,
    pulled_records: usize,
    conflicts_available_for_merge: bool,
    pulled_snapshot: Value,
    latency_ms: u64,
    message: String,
}

struct LanHttpResponse {
    status_code: u16,
    headers: std::collections::HashMap<String, String>,
    body: String,
}

fn lan_keyring_username(shop_sync_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(shop_sync_key.as_bytes());
    let digest = hasher.finalize();
    format!("shop-lan-{}", digest.iter().map(|byte| format!("{byte:02x}")).collect::<String>())
}

fn read_lan_pairing_secret(shop_sync_key: &str) -> Result<String, String> {
    if shop_sync_key.trim().len() < 3 || shop_sync_key.len() > 200 {
        return Err("The shop synchronization identity is invalid.".into());
    }
    let entry = Entry::new(KEYRING_SERVICE, &lan_keyring_username(shop_sync_key))
        .map_err(|error| format!("Could not open the operating-system credential vault: {error}"))?;
    let secret = entry.get_password().map_err(|error| {
        format!("This desktop has not securely paired with the shop LAN yet. Connect to the internet and refresh the Sync Hub first. ({error})")
    })?;
    if secret.len() != 64 || !secret.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("The locally protected shop pairing credential is invalid. Reconnect to BeBoss Cloud to provision a fresh key.".into());
    }
    Ok(secret.to_ascii_lowercase())
}

#[tauri::command(rename_all = "camelCase")]
fn lan_store_shop_secret(shop_sync_key: String, secret: String) -> Result<(), String> {
    let secret = secret.trim().to_ascii_lowercase();
    if shop_sync_key.trim().len() < 3 || shop_sync_key.len() > 200
        || secret.len() != 64 || !secret.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("The server returned an invalid shop LAN credential.".into());
    }
    let entry = Entry::new(KEYRING_SERVICE, &lan_keyring_username(&shop_sync_key))
        .map_err(|error| format!("Could not open the operating-system credential vault: {error}"))?;
    entry.set_password(&secret)
        .map_err(|error| format!("Could not protect the shop LAN credential in the operating-system vault: {error}"))
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK_SIZE: usize = 64;
    let mut normalized = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let digest = Sha256::digest(key);
        normalized[..32].copy_from_slice(&digest);
    } else {
        normalized[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36u8; BLOCK_SIZE];
    let mut outer_pad = [0x5cu8; BLOCK_SIZE];
    for index in 0..BLOCK_SIZE {
        inner_pad[index] ^= normalized[index];
        outer_pad[index] ^= normalized[index];
    }
    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message);
    let inner_digest = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_digest);
    outer.finalize().into()
}

fn lan_derive_subkey(master_secret_ascii_hex: &str, domain: &str) -> [u8; 32] {
    let mut info = domain.as_bytes().to_vec();
    // Keep this byte-for-byte compatible with Android CryptoKeyManager.deriveSubkey:
    // HMAC-SHA256(shopSecretAsciiHex, UTF8(domain) || 0x01).
    info.push(0x01);
    hmac_sha256(master_secret_ascii_hex.as_bytes(), &info)
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn constant_time_string_eq(left: &str, right: &str) -> bool {
    let a = left.as_bytes();
    let b = right.as_bytes();
    if a.len() != b.len() { return false; }
    a.iter().zip(b.iter()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn lan_signature(shop_secret: &str, payload: &str) -> String {
    let key = lan_derive_subkey(shop_secret, "BeBoss_LAN_HMAC_v2");
    bytes_to_lower_hex(&hmac_sha256(&key, payload.as_bytes())[..16])
}

fn lan_aes_key(shop_secret: &str) -> [u8; 32] {
    lan_derive_subkey(shop_secret, "BeBoss_LAN_AES256GCM_v2")
}

fn gzip_lan_payload(plain: &[u8]) -> Result<Vec<u8>, String> {
    if plain.len() > LAN_MAX_UNCOMPRESSED_BYTES {
        return Err("The shop snapshot exceeds the 5 MB uncompressed LAN transfer limit.".into());
    }
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(plain).map_err(|error| format!("Could not compress the desktop LAN snapshot: {error}"))?;
    encoder.finish().map_err(|error| format!("Could not finish compressing the desktop LAN snapshot: {error}"))
}

fn gunzip_lan_payload(compressed: &[u8]) -> Result<Vec<u8>, String> {
    if compressed.is_empty() || compressed.len() > 70_000_000 {
        return Err("The compressed BeBoss LAN snapshot is empty or oversized.".into());
    }
    let decoder = GzDecoder::new(compressed);
    let mut bounded = decoder.take((LAN_MAX_UNCOMPRESSED_BYTES + 1) as u64);
    let mut plain = Vec::with_capacity(compressed.len().saturating_mul(2).min(LAN_MAX_UNCOMPRESSED_BYTES));
    bounded.read_to_end(&mut plain).map_err(|error| format!("The compressed BeBoss LAN snapshot is invalid: {error}"))?;
    if plain.len() > LAN_MAX_UNCOMPRESSED_BYTES {
        return Err("The decompressed BeBoss LAN snapshot exceeds the 5 MB safety limit.".into());
    }
    Ok(plain)
}

fn encrypt_lan_body(plain: &str, shop_secret: &str, timestamp: &str, nonce_text: &str) -> Result<String, String> {
    if plain.len() > LAN_MAX_UNCOMPRESSED_BYTES {
        return Err("The shop snapshot exceeds the 5 MB uncompressed LAN transfer limit.".into());
    }
    let compressed = gzip_lan_payload(plain.as_bytes())?;
    let key = lan_aes_key(shop_secret);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let random = Uuid::new_v4();
    let iv = &random.as_bytes()[..12];
    let nonce = Nonce::from_slice(iv);
    let aad = format!("{timestamp}|{nonce_text}");
    let encrypted = cipher.encrypt(nonce, Payload { msg: &compressed, aad: aad.as_bytes() })
        .map_err(|error| format!("Could not encrypt the desktop LAN payload: {error}"))?;
    Ok(format!("GCM2Z:{}:{}", BASE64_STANDARD.encode(iv), BASE64_STANDARD.encode(encrypted)))
}

fn decrypt_lan_body(envelope: &str, shop_secret: &str, timestamp: &str, nonce_text: &str) -> Result<String, String> {
    let mut parts = envelope.splitn(3, ':');
    let version = parts.next().unwrap_or_default();
    let iv_text = parts.next().unwrap_or_default();
    let cipher_text = parts.next().unwrap_or_default();
    if !matches!(version, "GCM1" | "GCM2Z") || iv_text.is_empty() || cipher_text.is_empty() {
        return Err("The Android hub returned an unsupported encrypted payload.".into());
    }
    let iv = BASE64_STANDARD.decode(iv_text).map_err(|_| "The Android hub returned an invalid encryption nonce.")?;
    let ciphertext = BASE64_STANDARD.decode(cipher_text).map_err(|_| "The Android hub returned an invalid encrypted payload.")?;
    if iv.len() != 12 || ciphertext.len() < 16 || ciphertext.len() > 70_000_000 {
        return Err("The Android hub returned an incomplete or oversized encrypted snapshot.".into());
    }
    let key = lan_aes_key(shop_secret);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|error| error.to_string())?;
    let nonce = Nonce::from_slice(&iv);
    let aad = format!("{timestamp}|{nonce_text}");
    let decrypted = cipher.decrypt(nonce, Payload { msg: &ciphertext, aad: aad.as_bytes() })
        .map_err(|_| "The Android hub payload failed AES-GCM authentication.")?;
    let plain = if version == "GCM2Z" {
        gunzip_lan_payload(&decrypted)?
    } else {
        if decrypted.len() > LAN_MAX_UNCOMPRESSED_BYTES {
            return Err("The Android hub snapshot exceeds the 5 MB safety limit.".into());
        }
        decrypted
    };
    String::from_utf8(plain).map_err(|_| "The Android hub payload is not valid UTF-8.".to_string())
}

fn lan_http_request(
    ip: IpAddr,
    port: u16,
    method: &str,
    path: &str,
    timestamp: &str,
    nonce: &str,
    signature: &str,
    body: &str,
) -> Result<LanHttpResponse, String> {
    let address = SocketAddr::new(ip, port);
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
        .map_err(|error| format!("Could not connect to the Android hub at {ip}:{port}: {error}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(15))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(15))).map_err(|error| error.to_string())?;

    let request_head = format!(
        "{method} {path} HTTP/1.1\r\nHost: {ip}:{port}\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\nX-BeBoss-Timestamp: {timestamp}\r\nX-BeBoss-Nonce: {nonce}\r\nX-BeBoss-Signature: {signature}\r\n\r\n",
        body.as_bytes().len()
    );
    stream.write_all(request_head.as_bytes()).map_err(|error| error.to_string())?;
    if !body.is_empty() {
        stream.write_all(body.as_bytes()).map_err(|error| error.to_string())?;
    }
    stream.flush().map_err(|error| error.to_string())?;

    let mut bytes = Vec::new();
    let mut buffer = [0u8; 16_384];
    loop {
        let read = stream.read(&mut buffer).map_err(|error| format!("Could not read the Android hub response: {error}"))?;
        if read == 0 { break; }
        if bytes.len().saturating_add(read) > 72_000_000 {
            return Err("The Android hub response exceeded the 72 MB safety limit.".into());
        }
        bytes.extend_from_slice(&buffer[..read]);
    }
    let response = String::from_utf8(bytes).map_err(|_| "The Android hub returned a non-UTF-8 HTTP response.")?;
    let separator = response.find("\r\n\r\n").ok_or_else(|| "The Android hub returned malformed HTTP.".to_string())?;
    let header_text = &response[..separator];
    let body_text = &response[separator + 4..];
    let mut header_lines = header_text.split("\r\n");
    let status_code = header_lines.next().and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok()).unwrap_or(500);
    let mut headers = std::collections::HashMap::new();
    for line in header_lines {
        if let Some((key, value)) = line.split_once(':') {
            headers.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    Ok(LanHttpResponse { status_code, headers, body: body_text.to_string() })
}

fn validate_private_lan_ip(ip: IpAddr) -> Result<(), String> {
    let allowed = match ip {
        IpAddr::V4(value) => value.is_private() || value.is_link_local() || value.is_loopback(),
        IpAddr::V6(value) => value.is_unique_local() || value.is_unicast_link_local() || value.is_loopback(),
    };
    if !allowed {
        return Err("LAN sync only connects to private, link-local or loopback addresses.".into());
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn lan_discover_hubs(shop_sync_key: String, timeout_ms: Option<u64>) -> Result<Vec<LanHub>, String> {
    let shop_secret = read_lan_pairing_secret(&shop_sync_key)?;
    let timeout = timeout_ms.unwrap_or(8_000).clamp(1_000, 15_000);
    let socket = UdpSocket::bind("0.0.0.0:8990")
        .map_err(|error| format!("Could not listen for BeBoss LAN discovery on UDP 8990: {error}"))?;
    socket.set_read_timeout(Some(Duration::from_millis(250))).map_err(|error| error.to_string())?;
    let started = Instant::now();
    let mut buffer = [0u8; 8_192];
    let mut discovered: std::collections::HashMap<String, LanHub> = std::collections::HashMap::new();

    while started.elapsed() < Duration::from_millis(timeout) {
        match socket.recv_from(&mut buffer) {
            Ok((size, sender)) => {
                if size == 0 { continue; }
                let value: Value = match serde_json::from_slice(&buffer[..size]) { Ok(value) => value, Err(_) => continue };
                if value.get("magic").and_then(Value::as_str) != Some("BEBOSS_HUB_V3") { continue; }
                let id = value.get("id").and_then(Value::as_str).unwrap_or_default();
                let claimed_ip = value.get("ip").and_then(Value::as_str).unwrap_or_default();
                let port = value.get("port").and_then(Value::as_u64).unwrap_or(0);
                let timestamp = value.get("ts").and_then(Value::as_i64).unwrap_or(0);
                let signature = value.get("sig").and_then(Value::as_str).unwrap_or_default();
                let now_ms = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64;
                if id.is_empty() || port != 8989 || timestamp <= 0
                    || claimed_ip != sender.ip().to_string()
                    || now_ms.saturating_sub(timestamp).abs() > 30_000
                { continue; }
                let signed_data = format!("{id}|{claimed_ip}|{port}|{timestamp}");
                if !constant_time_string_eq(signature, &lan_signature(&shop_secret, &signed_data)) { continue; }
                let hub = LanHub {
                    id: id.to_string(),
                    shop_name: value.get("shopName").and_then(Value::as_str).unwrap_or("BeBoss Terminal").to_string(),
                    branch_name: value.get("branchName").and_then(Value::as_str).unwrap_or("Main Store").to_string(),
                    ip_address: claimed_ip.to_string(),
                    port: port as u16,
                    products_count: value.get("productsCount").and_then(Value::as_u64).unwrap_or(0),
                    sales_count: value.get("salesCount").and_then(Value::as_u64).unwrap_or(0),
                    branches_count: value.get("branchesCount").and_then(Value::as_u64).unwrap_or(0),
                    last_seen_at: now_millis().unwrap_or_default(),
                };
                discovered.insert(hub.ip_address.clone(), hub);
            }
            Err(error) if matches!(error.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut | std::io::ErrorKind::Interrupted) => continue,
            Err(error) => return Err(format!("LAN discovery stopped unexpectedly: {error}")),
        }
    }
    let mut hubs: Vec<LanHub> = discovered.into_values().collect();
    hubs.sort_by(|a, b| b.last_seen_at.cmp(&a.last_seen_at));
    Ok(hubs)
}

fn decode_verified_lan_snapshot(
    response: &LanHttpResponse,
    shop_secret: &str,
    expected_timestamp: &str,
    expected_nonce: &str,
) -> Result<Value, String> {
    let response_signature = response.headers.get("x-beboss-signature").map(String::as_str).unwrap_or_default();
    if !constant_time_string_eq(response_signature, &lan_signature(shop_secret, &response.body)) {
        return Err("The Android hub's downloaded snapshot failed its HMAC check.".into());
    }
    let envelope: Value = serde_json::from_str(&response.body)
        .map_err(|_| "The Android hub returned an invalid encrypted snapshot envelope.")?;
    let encrypted = envelope.get("enc").and_then(Value::as_str)
        .ok_or_else(|| "The Android hub omitted its encrypted snapshot.".to_string())?;
    let echoed_timestamp = envelope.get("ts").and_then(Value::as_str).unwrap_or_default();
    let echoed_nonce = envelope.get("nonce").and_then(Value::as_str).unwrap_or_default();
    if echoed_timestamp != expected_timestamp || echoed_nonce != expected_nonce {
        return Err("The Android hub's snapshot response does not match this request.".into());
    }

    let pulled_json = decrypt_lan_body(encrypted, shop_secret, expected_timestamp, expected_nonce)?;
    let pulled_snapshot: Value = serde_json::from_str(&pulled_json)
        .map_err(|_| "The Android hub snapshot is not valid JSON.")?;
    if !pulled_snapshot.is_object() || !pulled_snapshot.get("metadata").is_some_and(Value::is_object) {
        return Err("The Android hub returned an incomplete business snapshot.".into());
    }
    let schema_version = pulled_snapshot["metadata"].get("schemaVersion")
        .and_then(Value::as_u64).unwrap_or(0);
    if !(1..=3).contains(&schema_version) {
        return Err(format!("The Android hub snapshot schema version {schema_version} is not supported by this desktop."));
    }
    for key in ["products", "customers", "sales", "saleItems", "customerPayments", "purchases", "stockTransfers", "branches", "users", "tombstones"] {
        if !pulled_snapshot.get(key).is_some_and(Value::is_array) {
            return Err(format!("The Android hub snapshot is missing its {key} collection. No data was imported."));
        }
    }
    Ok(pulled_snapshot)
}

#[tauri::command(rename_all = "camelCase")]
fn lan_pull_from_hub(
    shop_sync_key: String,
    ip_address: String,
    port: u16,
) -> Result<LanSyncResult, String> {
    let started = Instant::now();
    let shop_secret = read_lan_pairing_secret(&shop_sync_key)?;
    if port != 8989 { return Err("BeBoss Android LAN hubs use TCP port 8989.".into()); }
    let ip: IpAddr = ip_address.trim().parse().map_err(|_| "Enter a valid local IP address.")?;
    validate_private_lan_ip(ip)?;

    // Recovery mode is deliberately pull-only: it never sends a desktop snapshot
    // to the phone. This is the safe path when this installation has no local shop
    // snapshot yet, or when the phone is the only authoritative source available.
    let pull_timestamp = now_millis()?.to_string();
    let pull_nonce = Uuid::new_v4().to_string();
    let pull_payload = format!("GET|/api/sync/pull|{pull_timestamp}|{pull_nonce}|");
    let pull_signature = lan_signature(&shop_secret, &pull_payload);
    let pull = lan_http_request(
        ip, port, "GET", "/api/sync/pull", &pull_timestamp, &pull_nonce, &pull_signature, ""
    )?;
    if !(200..300).contains(&pull.status_code) {
        return Err(format!("The Android hub rejected the read-only recovery request (HTTP {}).", pull.status_code));
    }

    let pulled_snapshot = decode_verified_lan_snapshot(
        &pull, &shop_secret, &pull_timestamp, &pull_nonce
    )?;

    let pulled_records = [
        "products", "customers", "sales", "saleItems", "customerPayments",
        "purchases", "stockTransfers", "branches", "users"
    ].iter().map(|key| pulled_snapshot.get(key).and_then(Value::as_array).map(Vec::len).unwrap_or(0)).sum();

    Ok(LanSyncResult {
        success: true,
        peer_ip: ip.to_string(),
        pushed_records: 0,
        pulled_records,
        conflicts_available_for_merge: true,
        pulled_snapshot,
        latency_ms: started.elapsed().as_millis() as u64,
        message: format!("Read-only recovery preview received {pulled_records} records from Android hub {ip}. Nothing was sent to or changed on the phone."),
    })
}


#[tauri::command(rename_all = "camelCase")]
fn lan_sync_with_hub(
    shop_sync_key: String,
    ip_address: String,
    port: u16,
    mut snapshot: Value,
) -> Result<LanSyncResult, String> {
    let started = Instant::now();
    let shop_secret = read_lan_pairing_secret(&shop_sync_key)?;
    if port != 8989 { return Err("BeBoss Android LAN hubs use TCP port 8989.".into()); }
    let ip: IpAddr = ip_address.trim().parse().map_err(|_| "Enter a valid local IP address.")?;
    validate_private_lan_ip(ip)?;
    if !snapshot.is_object() { return Err("The current shop snapshot is unavailable for LAN synchronization.".into()); }

    let timestamp_ms = now_millis()?;
    let metadata = snapshot.as_object_mut().unwrap().entry("metadata").or_insert_with(|| serde_json::json!({}));
    let metadata = metadata.as_object_mut().ok_or_else(|| "The shop snapshot metadata is invalid.".to_string())?;
    metadata.insert("schemaVersion".into(), Value::from(3));
    metadata.insert("timestamp".into(), Value::from(timestamp_ms));
    metadata.insert("nonce".into(), Value::String(Uuid::new_v4().to_string()));
    metadata.insert("expiresAt".into(), Value::from(timestamp_ms.saturating_add(30 * 24 * 60 * 60 * 1000)));
    metadata.insert("exportedBy".into(), Value::String("BeBoss Desktop".into()));
    let package = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;

    let push_timestamp = timestamp_ms.to_string();
    let push_nonce = Uuid::new_v4().to_string();
    let encrypted_push = encrypt_lan_body(&package, &shop_secret, &push_timestamp, &push_nonce)?;
    let push_body = serde_json::json!({ "enc": encrypted_push, "ts": push_timestamp, "nonce": push_nonce }).to_string();
    let push_payload = format!("POST|/api/sync/push|{push_timestamp}|{push_nonce}|{push_body}");
    let push_signature = lan_signature(&shop_secret, &push_payload);
    let push = lan_http_request(ip, port, "POST", "/api/sync/push", &push_timestamp, &push_nonce, &push_signature, &push_body)?;
    if !(200..300).contains(&push.status_code) {
        return Err(format!("The Android hub rejected the desktop snapshot (HTTP {}).", push.status_code));
    }
    let push_signature_response = push.headers.get("x-beboss-signature").map(String::as_str).unwrap_or_default();
    if !constant_time_string_eq(push_signature_response, &lan_signature(&shop_secret, &push.body)) {
        return Err("The Android hub's push acknowledgement failed its HMAC check.".into());
    }
    let push_result: Value = serde_json::from_str(&push.body).map_err(|_| "The Android hub returned an invalid push acknowledgement.")?;
    if push_result.get("success").and_then(Value::as_bool) != Some(true) {
        return Err("The Android hub did not confirm the desktop snapshot merge.".into());
    }

    let pull_timestamp = now_millis()?.to_string();
    let pull_nonce = Uuid::new_v4().to_string();
    let pull_payload = format!("GET|/api/sync/pull|{pull_timestamp}|{pull_nonce}|");
    let pull_signature = lan_signature(&shop_secret, &pull_payload);
    let pull = lan_http_request(ip, port, "GET", "/api/sync/pull", &pull_timestamp, &pull_nonce, &pull_signature, "")?;
    if !(200..300).contains(&pull.status_code) {
        return Err(format!("The Android hub rejected the desktop snapshot request (HTTP {}).", pull.status_code));
    }
    let pull_signature_response = pull.headers.get("x-beboss-signature").map(String::as_str).unwrap_or_default();
    if !constant_time_string_eq(pull_signature_response, &lan_signature(&shop_secret, &pull.body)) {
        return Err("The Android hub's downloaded snapshot failed its HMAC check.".into());
    }
    let pull_envelope: Value = serde_json::from_str(&pull.body).map_err(|_| "The Android hub returned an invalid encrypted snapshot envelope.")?;
    let encrypted = pull_envelope.get("enc").and_then(Value::as_str).ok_or_else(|| "The Android hub omitted its encrypted snapshot.".to_string())?;
    let echoed_timestamp = pull_envelope.get("ts").and_then(Value::as_str).unwrap_or_default();
    let echoed_nonce = pull_envelope.get("nonce").and_then(Value::as_str).unwrap_or_default();
    if echoed_timestamp != pull_timestamp || echoed_nonce != pull_nonce {
        return Err("The Android hub's snapshot response does not match this request.".into());
    }
    let pulled_json = decrypt_lan_body(encrypted, &shop_secret, &pull_timestamp, &pull_nonce)?;
    let pulled_snapshot: Value = serde_json::from_str(&pulled_json).map_err(|_| "The Android hub snapshot is not valid JSON.")?;
    if !pulled_snapshot.is_object() || !pulled_snapshot.get("metadata").is_some() {
        return Err("The Android hub returned an incomplete business snapshot.".into());
    }
    let count_records = |key: &str| pulled_snapshot.get(key).and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    let pulled_records = ["products","customers","sales","saleItems","customerPayments","purchases","stockTransfers","branches","users"]
        .iter().map(|key| count_records(key)).sum();
    let pushed_records = ["products","customers","sales","saleItems","customerPayments","purchases","stockTransfers","branches","users"]
        .iter().map(|key| snapshot.get(key).and_then(Value::as_array).map(Vec::len).unwrap_or(0)).sum();
    Ok(LanSyncResult {
        success: true,
        peer_ip: ip.to_string(),
        pushed_records,
        pulled_records,
        conflicts_available_for_merge: true,
        pulled_snapshot,
        latency_ms: started.elapsed().as_millis() as u64,
        message: format!("Encrypted BeBoss LAN sync completed with {ip}: sent {pushed_records} and received {pulled_records} records. Conflict-safe merge is ready."),
    })
}


fn main() {
    PROCESS_START.set(Instant::now()).ok();

    // Sentry's Rust client installs panic capture for the native process. The
    // guard must outlive the Tauri event loop so pending crash events can flush.
    let _sentry_guard = option_env!("SENTRY_DSN")
        .map(str::trim)
        .filter(|dsn| !dsn.is_empty())
        .map(|dsn| {
            // `ClientOptions` is `#[non_exhaustive]`, so it cannot be built with a
            // struct literal (even with `..Default::default()`). Start from the
            // default and assign the public fields instead.
            let mut options = sentry::ClientOptions::default();
            options.release = sentry::release_name!();
            options.environment = Some(
                if cfg!(debug_assertions) { "development" } else { "production" }.into()
            );
            options.send_default_pii = false;
            options.before_send = Some(std::sync::Arc::new(|mut event| {
                // Native panic messages and request metadata can contain POS
                // records, local paths, phone numbers or credentials. Keep the
                // stack frames and release but remove user/request/breadcrumb
                // context and replace all free-form exception text.
                event.user = None;
                event.request = None;
                event.server_name = None;
                event.transaction = None;
                event.culprit = None;
                event.contexts.clear();
                event.extra.clear();
                event.breadcrumbs.values.clear();
                event.tags.retain(|key, _| {
                    matches!(key.as_str(), "application" | "platform")
                });
                event.message = Some("A BeBoss Desktop native error occurred (details redacted).".to_string());
                if let Some(logentry) = event.logentry.as_mut() {
                    logentry.message = "A BeBoss Desktop native error occurred (details redacted).".to_string();
                    logentry.params.clear();
                }
                for exception in event.exception.values.iter_mut() {
                    exception.ty = "NativeException".to_string();
                    exception.value = Some("Native exception details redacted.".to_string());
                }
                Some(event)
            }));
            sentry::init((dsn, options))
        });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            secure_get, secure_set, secure_remove, get_device_id, recover_local_database,
            setup_preflight, test_credential_vault,
            local_load, local_save_baseline, local_queue, local_pending, local_outbox_count, local_unassigned_outbox_count, local_ack,
            system_diagnostics, network_ping, print_escpos_thermal,
            export_backup_file, lan_store_shop_secret, lan_discover_hubs, lan_pull_from_hub, lan_sync_with_hub
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
    fn does_not_generate_a_replacement_key_for_an_existing_encrypted_database() {
        let path = test_path("missing-key-encrypted");
        let connection = open_keyed_database(&path, "original-key")
            .expect("encrypted database should initialize");
        connection.execute_batch("CREATE TABLE retained_records (value TEXT NOT NULL);")
            .expect("fixture table should be created");
        drop(connection);

        assert!(!may_generate_database_key(&path),
            "an encrypted database must never receive a newly generated replacement key");
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn permits_key_initialization_for_a_readable_legacy_sqlite_database() {
        let path = test_path("missing-key-legacy");
        let legacy = Connection::open(&path).expect("legacy database should initialize");
        legacy.execute_batch("CREATE TABLE retained_records (value TEXT NOT NULL);")
            .expect("fixture table should be created");
        drop(legacy);

        assert!(may_generate_database_key(&path),
            "a readable legacy SQLite database must be eligible for safe encryption migration");
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn refuses_key_initialization_for_unrecognized_existing_bytes() {
        let path = test_path("missing-key-invalid");
        fs::write(&path, b"not a sqlite database").expect("fixture bytes should be written");

        assert!(!may_generate_database_key(&path),
            "unrecognized existing bytes must be preserved for recovery");
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
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
    fn shop_scope_rejects_invalid_keys_and_namespaces_local_state() {
        assert_eq!(scoped_snapshot_key("shop_123456").unwrap(), "snapshot:shop_123456");
        assert_eq!(scoped_hlc_key("shop_123456").unwrap(), "last-hlc:shop_123456");
        assert!(scoped_snapshot_key("").is_err());
        assert!(scoped_snapshot_key("shop:one").is_err());
        assert!(scoped_hlc_key("shop with spaces").is_err());
    }

    #[test]
    fn legacy_outbox_rows_are_quarantined_by_tenant_column_migration() {
        let connection = Connection::open_in_memory().expect("SQLite should open");
        connection.execute_batch(
            "CREATE TABLE sync_outbox (
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
             INSERT INTO sync_outbox(id, operation, payload, hlc, device_id, created_at)
             VALUES ('legacy-1', 'SALE', '{}', 1, 'old-device', 10);"
        ).expect("legacy outbox schema should be created");

        ensure_sync_outbox_tenant_column(&connection)
            .expect("tenant column migration should succeed");
        let tenant: String = connection.query_row(
            "SELECT tenant_id FROM sync_outbox WHERE id = 'legacy-1'",
            [],
            |row| row.get(0)
        ).expect("legacy row should remain present");
        assert_eq!(tenant, "", "old rows must not be assigned to an arbitrary shop");

        let tenant_columns: i64 = connection.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('sync_outbox') WHERE name = 'tenant_id'",
            [],
            |row| row.get(0)
        ).expect("tenant column should exist");
        assert_eq!(tenant_columns, 1);

        let directory = env::temp_dir().join(format!("unused-tenant-test-{}", Uuid::new_v4()));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn pending_outbox_queries_are_isolated_by_registered_shop() {
        let connection = Connection::open_in_memory().expect("SQLite should open");
        connection.execute_batch(
            "CREATE TABLE sync_outbox (
                id TEXT PRIMARY KEY NOT NULL,
                tenant_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL
             );
             INSERT INTO sync_outbox(id, tenant_id, status, created_at) VALUES
               ('shop-a-1', 'shop_A_123', 'PENDING', 1),
               ('shop-b-1', 'shop_B_123', 'PENDING', 2),
               ('legacy-1', '', 'PENDING', 3);"
        ).expect("outbox fixture should be created");

        let shop_a: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING' AND tenant_id='shop_A_123'",
            [], |row| row.get(0)
        ).expect("shop A count should be readable");
        let shop_b: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING' AND tenant_id='shop_B_123'",
            [], |row| row.get(0)
        ).expect("shop B count should be readable");
        let unassigned: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sync_outbox WHERE status='PENDING' AND tenant_id=''",
            [], |row| row.get(0)
        ).expect("legacy count should be readable");
        assert_eq!(shop_a, 1);
        assert_eq!(shop_b, 1);
        assert_eq!(unassigned, 1);
    }

    #[test]
    fn database_quick_check_confirms_a_healthy_encrypted_database() {
        let path = test_path("quick-check");
        let connection = open_keyed_database(&path, "integrity-test-key")
            .expect("SQLCipher database should initialize");
        connection.execute_batch(
            "CREATE TABLE shop_records (id TEXT PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO shop_records(id, value) VALUES ('one', 'retained data');"
        ).expect("test data should be written");

        assert_eq!(
            database_integrity_check(&connection).expect("healthy database should pass quick_check"),
            "ok"
        );
        drop(connection);
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }


    #[test]
    fn lan_gzip_envelope_round_trips_and_legacy_gcm1_remains_readable() {
        let secret = "ab".repeat(32);
        let timestamp = "1790000000000";
        let nonce_text = "gzip-lan-test-nonce";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 3, "timestamp": 1790000000000i64 },
            "shopProfile": { "shopName": "BeBoss Test Shop" },
            "products": (0..500).map(|index| serde_json::json!({
                "id": format!("product-{index}"),
                "name": "Repeated inventory item",
                "description": "Repeated data compresses well over a local hotspot"
            })).collect::<Vec<_>>(),
            "customers": [], "sales": [], "saleItems": [], "customerPayments": [],
            "purchases": [], "stockTransfers": [], "branches": [], "users": [], "tombstones": []
        });
        let plain = snapshot.to_string();
        let compressed = gzip_lan_payload(plain.as_bytes()).expect("gzip should succeed");
        assert!(compressed.len() < plain.len());
        let encrypted = encrypt_lan_body(&plain, &secret, timestamp, nonce_text).expect("new encryption should succeed");
        assert!(encrypted.starts_with("GCM2Z:"));
        assert_eq!(decrypt_lan_body(&encrypted, &secret, timestamp, nonce_text).expect("new envelope should decode"), plain);

        let key = lan_aes_key(&secret);
        let cipher = Aes256Gcm::new_from_slice(&key).expect("AES-GCM key should be valid");
        let random = Uuid::new_v4();
        let iv = &random.as_bytes()[..12];
        let aad = format!("{timestamp}|{nonce_text}");
        let ciphertext = cipher.encrypt(
            Nonce::from_slice(iv),
            Payload { msg: plain.as_bytes(), aad: aad.as_bytes() }
        ).expect("legacy payload should encrypt");
        let legacy = format!("GCM1:{}:{}", BASE64_STANDARD.encode(iv), BASE64_STANDARD.encode(ciphertext));
        assert_eq!(decrypt_lan_body(&legacy, &secret, timestamp, nonce_text).expect("legacy GCM1 should remain readable"), plain);
    }

    #[test]
    fn read_only_phone_recovery_accepts_a_valid_hmac_and_aes_gcm_snapshot() {
        let secret = "ab".repeat(32);
        let timestamp = "1790000000000";
        let nonce = "recovery-nonce-123";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 3, "timestamp": 1790000000000i64 },
            "shopProfile": { "shopName": "BeBoss Test Shop" },
            "products": [], "customers": [], "sales": [], "saleItems": [],
            "customerPayments": [], "purchases": [], "stockTransfers": [],
            "branches": [], "users": [], "tombstones": []
        });
        let encrypted = encrypt_lan_body(&snapshot.to_string(), &secret, timestamp, nonce)
            .expect("snapshot should encrypt");
        let body = serde_json::json!({ "enc": encrypted, "ts": timestamp, "nonce": nonce }).to_string();
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-beboss-signature".into(), lan_signature(&secret, &body));
        let response = LanHttpResponse { status_code: 200, headers, body };

        let decoded = decode_verified_lan_snapshot(&response, &secret, timestamp, nonce)
            .expect("signed and encrypted phone snapshot should verify");
        assert_eq!(decoded["metadata"]["schemaVersion"], 3);
        assert!(decoded["products"].is_array());
    }

    #[test]
    fn read_only_phone_recovery_rejects_a_modified_response_signature() {
        let secret = "cd".repeat(32);
        let timestamp = "1790000000000";
        let nonce = "recovery-nonce-456";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 3 },
            "products": [], "customers": [], "sales": [], "saleItems": [],
            "customerPayments": [], "purchases": [], "stockTransfers": [],
            "branches": [], "users": [], "tombstones": []
        });
        let encrypted = encrypt_lan_body(&snapshot.to_string(), &secret, timestamp, nonce)
            .expect("snapshot should encrypt");
        let body = serde_json::json!({ "enc": encrypted, "ts": timestamp, "nonce": nonce }).to_string();
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-beboss-signature".into(), "00".repeat(32));
        let response = LanHttpResponse { status_code: 200, headers, body };

        assert!(decode_verified_lan_snapshot(&response, &secret, timestamp, nonce).is_err());
    }

    #[test]
    fn read_only_phone_recovery_rejects_a_response_bound_to_another_request() {
        let secret = "ef".repeat(32);
        let timestamp = "1790000000000";
        let nonce = "recovery-nonce-789";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 3 },
            "products": [], "customers": [], "sales": [], "saleItems": [],
            "customerPayments": [], "purchases": [], "stockTransfers": [],
            "branches": [], "users": [], "tombstones": []
        });
        let encrypted = encrypt_lan_body(&snapshot.to_string(), &secret, timestamp, nonce)
            .expect("snapshot should encrypt");
        let body = serde_json::json!({ "enc": encrypted, "ts": timestamp, "nonce": "other-request" }).to_string();
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-beboss-signature".into(), lan_signature(&secret, &body));
        let response = LanHttpResponse { status_code: 200, headers, body };

        assert!(decode_verified_lan_snapshot(&response, &secret, timestamp, nonce).is_err());
    }

    #[test]
    fn read_only_phone_recovery_rejects_incomplete_business_collections() {
        let secret = "11".repeat(32);
        let timestamp = "1790000000000";
        let nonce = "recovery-nonce-abc";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 3 },
            "products": [], "customers": [], "sales": [], "saleItems": [],
            "customerPayments": [], "purchases": [], "stockTransfers": [],
            "branches": [], "users": []
        });
        let encrypted = encrypt_lan_body(&snapshot.to_string(), &secret, timestamp, nonce)
            .expect("snapshot should encrypt");
        let body = serde_json::json!({ "enc": encrypted, "ts": timestamp, "nonce": nonce }).to_string();
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-beboss-signature".into(), lan_signature(&secret, &body));
        let response = LanHttpResponse { status_code: 200, headers, body };

        let error = decode_verified_lan_snapshot(&response, &secret, timestamp, nonce)
            .expect_err("snapshot without tombstones must be rejected");
        assert!(error.contains("tombstones"));
    }

    #[test]
    fn read_only_phone_recovery_rejects_unknown_schema_versions() {
        let secret = "22".repeat(32);
        let timestamp = "1790000000000";
        let nonce = "recovery-nonce-def";
        let snapshot = serde_json::json!({
            "metadata": { "schemaVersion": 99 },
            "products": [], "customers": [], "sales": [], "saleItems": [],
            "customerPayments": [], "purchases": [], "stockTransfers": [],
            "branches": [], "users": [], "tombstones": []
        });
        let encrypted = encrypt_lan_body(&snapshot.to_string(), &secret, timestamp, nonce)
            .expect("snapshot should encrypt");
        let body = serde_json::json!({ "enc": encrypted, "ts": timestamp, "nonce": nonce }).to_string();
        let mut headers = std::collections::HashMap::new();
        headers.insert("x-beboss-signature".into(), lan_signature(&secret, &body));
        let response = LanHttpResponse { status_code: 200, headers, body };

        assert!(decode_verified_lan_snapshot(&response, &secret, timestamp, nonce).is_err());
    }

    #[test]
    fn database_storage_size_includes_wal_and_shared_memory_files() {
        let path = test_path("storage-size");
        fs::write(&path, vec![0u8; 128]).expect("database fixture should be created");
        fs::write(path.with_extension("sqlite-wal"), vec![0u8; 64]).expect("WAL fixture should be created");
        fs::write(path.with_extension("sqlite-shm"), vec![0u8; 32]).expect("SHM fixture should be created");

        assert_eq!(database_storage_bytes(&path), 224);
        let directory = path.parent().expect("test path has a parent");
        let _ = fs::remove_dir_all(directory);
    }

    fn printer_test_payload() -> ReceiptPrintPayload {
        ReceiptPrintPayload {
            shop_name: "BeBoss - PRINTER TEST".into(),
            receipt_number: "TEST-0001".into(),
            date: "2026-11-26 10:00".into(),
            cashier: "SYSTEM TEST".into(),
            customer: "NOT A SALE".into(),
            items: vec![ReceiptItemPayload {
                name: "Printer test".into(),
                quantity: 1.0,
                unit_price: 0.0,
                subtotal: 0.0,
            }],
            subtotal: 0.0,
            discount: 0.0,
            total: 0.0,
            paid: 0.0,
            balance: 0.0,
            payment_method: "TEST ONLY".into(),
            tin: "".into(),
            address: "".into(),
            phone: "".into(),
            header: "TEST PRINT - NOT A SALE".into(),
            footer: "No sale, stock or payment was recorded.".into(),
            seal: "DIAGNOSTIC ONLY".into(),
        }
    }

    #[test]
    fn escpos_test_receipt_contains_initialize_cut_and_no_sale_marker() {
        let bytes = encode_escpos_receipt(printer_test_payload());
        assert!(bytes.starts_with(&[0x1B, 0x40]), "ESC/POS job must initialize the printer");
        assert!(
            bytes.windows(b"TEST PRINT - NOT A SALE".len()).any(|w| w == b"TEST PRINT - NOT A SALE"),
            "printer diagnostics must be clearly marked as a test, not a sale"
        );
        assert!(bytes.ends_with(&[0x1D, 0x56, 0x42, 0x00, 0x1B, 0x70, 0x00, 0x19, 0xFA]),
            "receipt must include paper cut and cash drawer command sequence");
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

    #[test]
    fn allows_the_encrypted_per_owner_shop_cache() {
        assert!(is_valid_secure_key("shop-cache:owner_01"));
        assert!(!is_valid_secure_key("shop-cache:"));
        assert!(!is_valid_secure_key("shop-cache:owner:secret"));
    }

    #[test]
    fn keeps_internal_tenant_and_device_keys_reserved() {
        assert!(!is_valid_secure_key("shop_sync_key"));
        assert!(!is_valid_secure_key("shop-secret:primary"));
        assert!(!is_valid_secure_key("device-refresh-token"));
        assert!(!is_valid_secure_key("desktop-device-id"));
    }
}
