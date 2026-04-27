// Скрываем чёрное консольное окно в релизной сборке Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    trader_journal_lib::run()
}
