use std::{env, fs, path::Path};

fn local_sentry_dsn() -> Option<String> {
    for key in ["SENTRY_DSN", "VITE_SENTRY_DSN"] {
        if let Ok(value) = env::var(key) {
            let value = value.trim().to_string();
            if !value.is_empty() { return Some(value); }
        }
    }

    // Local Windows/macOS/Linux builds commonly keep public Vite settings in
    // desktop/.env.local. The DSN is a public ingest identifier, not a server key.
    let file = Path::new("../.env.local");
    println!("cargo:rerun-if-changed={}", file.display());
    let contents = fs::read_to_string(file).ok()?;
    contents.lines().find_map(|line| {
        let line = line.trim();
        if line.starts_with('#') { return None; }
        let (key, value) = line.split_once('=')?;
        if !matches!(key.trim(), "SENTRY_DSN" | "VITE_SENTRY_DSN") { return None; }
        let clean = value.trim().trim_matches('"').trim_matches('\'').to_string();
        (!clean.is_empty()).then_some(clean)
    })
}

fn main() {
    println!("cargo:rerun-if-env-changed=SENTRY_DSN");
    println!("cargo:rerun-if-env-changed=VITE_SENTRY_DSN");
    if let Some(dsn) = local_sentry_dsn() {
        println!("cargo:rustc-env=SENTRY_DSN={dsn}");
    }
    tauri_build::build()
}
