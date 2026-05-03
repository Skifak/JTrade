// Tauri: команды для файлов изображений в AppData/trader-journal-assets (не localStorage).

use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::Manager;
use url::Url;

const ASSETS_SUBDIR: &str = "trader-journal-assets";

fn assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(base.join(ASSETS_SUBDIR))
}

/// Проверка: относительный путь только glossary/... или trades/..., без выхода из корня.
fn resolve_under_assets(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    if rel.contains("..") {
        return Err("invalid path".into());
    }
    let first = rel.split('/').next().unwrap_or("");
    if first != "glossary" && first != "trades" {
        return Err("path must start with glossary/ or trades/".into());
    }
    let full = root.join(&rel);
    if !full.starts_with(root) {
        return Err("path escapes assets root".into());
    }
    Ok(full)
}

/// JS передаёт base64: в JSON-compact вместо `Vec<u8>` не раздуваем IPC (и не упираемся в лимит).
#[tauri::command]
fn tauri_attachments_write(
    app: tauri::AppHandle,
    rel_path: String,
    data: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| format!("b64: {}", e))?;
    let root = assets_root(&app)?;
    let target = resolve_under_assets(&root, &rel_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn tauri_attachments_read(app: tauri::AppHandle, rel_path: String) -> Result<Vec<u8>, String> {
    let root = assets_root(&app)?;
    let target = resolve_under_assets(&root, &rel_path)?;
    fs::read(&target).map_err(|e| e.to_string())
}

#[tauri::command]
fn tauri_attachments_remove_file(app: tauri::AppHandle, rel_path: String) -> Result<(), String> {
    let root = assets_root(&app)?;
    let target = resolve_under_assets(&root, &rel_path)?;
    if target.is_file() {
        let _ = fs::remove_file(&target);
    }
    Ok(())
}

/// Удаляет папку glossary/{id} или trades/{id} вместе с файлами.
#[tauri::command]
fn tauri_attachments_remove_scope_dir(
    app: tauri::AppHandle,
    scope: String,
    id: String,
) -> Result<(), String> {
    if scope != "glossary" && scope != "trades" {
        return Err("invalid scope".into());
    }
    let id: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if id.is_empty() {
        return Ok(());
    }
    let rel = format!("{}/{}", scope, id);
    let root = assets_root(&app)?;
    let target = resolve_under_assets(&root, &rel)?;
    if target.is_dir() {
        let _ = fs::remove_dir_all(&target);
    }
    Ok(())
}

#[tauri::command]
fn tauri_attachments_get_root(app: tauri::AppHandle) -> Result<String, String> {
    let p = assets_root(&app)?;
    p.to_str()
        .ok_or("non-utf8 path".to_string())
        .map(String::from)
}

fn validate_public_market_url(raw: &str) -> Result<(), String> {
    let u = Url::parse(raw).map_err(|e| format!("URL: {}", e))?;
    if u.scheme() != "https" {
        return Err("only https".into());
    }
    let host = u.host_str().ok_or("no host")?;
    match host {
        "stooq.com" | "www.stooq.com" => {
            if !u.path().starts_with("/q/l/") {
                return Err("stooq: только /q/l/".into());
            }
        }
        "query1.finance.yahoo.com" => {
            if !u.path().starts_with("/v8/finance/chart/") {
                return Err("yahoo: только /v8/finance/chart/".into());
            }
            if u.path().contains("..") {
                return Err("invalid path".into());
            }
        }
        _ => return Err("host не в allowlist".into()),
    }
    Ok(())
}

/// Обход CORS: только GET по белому списку URL (рынки).
#[tauri::command]
async fn tauri_fetch_allowed_http_get(url: String) -> Result<String, String> {
    validate_public_market_url(&url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("TraderJournal/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tauri_attachments_write,
            tauri_attachments_read,
            tauri_attachments_remove_file,
            tauri_attachments_remove_scope_dir,
            tauri_attachments_get_root,
            tauri_fetch_allowed_http_get
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
