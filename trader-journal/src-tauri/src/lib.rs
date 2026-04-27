// Точка входа Tauri-приложения. Сейчас Rust-стороны фронту не нужно ничего
// (никаких commands), вся работа со сделками/WS живёт в Svelte/WebView.
// Если позже захочешь нативный fetch (обход CORS Stooq и т.п.) — добавляй
// сюда #[tauri::command] и регистрируй через .invoke_handler.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
