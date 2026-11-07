#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod i18n;
mod models;
mod services;
mod tray;

use commands::app::{install_tools, set_language, tools_status};
use commands::boosty::{boosty_account, boosty_get_post, boosty_list, import_browser_cookies};
use commands::cookies::{
    detect_site_from_url, get_cookies_list, get_site_cookies, get_site_cookies_path,
    remove_site_cookies, save_site_cookies,
};
use commands::download::{cancel_download, download_video, get_formats, prepare_task, release_task};
use std::sync::atomic::Ordering;
use tauri::{Manager, WindowEvent};

struct WorkerCleanup;
impl tauri::Resource for WorkerCleanup {}
impl Drop for WorkerCleanup {
    fn drop(&mut self) {
        services::process::stop_all();
        commands::download::cleanup_staged_cookies(true);
    }
}

fn main() {
    i18n::init_from_system();
    tauri::Builder::default()
        // First, as the plugin requires: a second launch raises the window from the tray and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            commands::download::cleanup_staged_cookies(false);
            services::cookies::migrate_plaintext();
            services::tools::cleanup_partials();
            // A normal exit calls cleanup_before_exit, which drops the resources.
            app.resources_table().add(WorkerCleanup);
            tray::build(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // The close button hides the window to the tray; a real exit is the "Quit" item in the tray menu.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !tray::QUITTING.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_formats,
            download_video,
            boosty_list,
            boosty_get_post,
            boosty_account,
            import_browser_cookies,
            set_language,
            tools_status,
            install_tools,
            cancel_download,
            prepare_task,
            release_task,
            save_site_cookies,
            get_site_cookies,
            get_site_cookies_path,
            get_cookies_list,
            remove_site_cookies,
            detect_site_from_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
