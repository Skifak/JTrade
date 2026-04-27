// Tauri: команды для файлов изображений в AppData/trader-journal-assets (не localStorage).

use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

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

#[tauri::command]
fn tauri_attachments_write(
    app: tauri::AppHandle,
    rel_path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let root = assets_root(&app)?;
    let target = resolve_under_assets(&root, &rel_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, data).map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tauri_attachments_write,
            tauri_attachments_read,
            tauri_attachments_remove_file,
            tauri_attachments_remove_scope_dir,
            tauri_attachments_get_root
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
