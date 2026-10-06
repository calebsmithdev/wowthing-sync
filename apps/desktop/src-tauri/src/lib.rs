use tauri::Manager;
// Declare the internal namespaces
mod commands;
mod setup;
mod sync_queue;
mod sync_service;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .on_permission_request(|_, kind| setup::permissions::webview_permission_response(kind))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = &app.handle();

            setup::mac::setup_mac(handle)?;
            setup::desktop::setup_desktop(handle)?;
            setup::system_tray_menu::setup_system_tray_menu(handle)?;
            setup::logs::setup_logs(handle)?;

            app.manage(sync_service::SyncService::start(app.handle().clone()));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Don't kill the app when the user clicks close
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::submit_addon_data::submit_addon_data,
            sync_service::get_sync_status,
            sync_service::configure_sync,
            sync_service::sync_now
        ])
        .build(tauri::generate_context!())
        .expect("Error while building the Wowthing Sync application")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                use tauri::Manager;
                app.state::<sync_service::SyncService>().shutdown();
            }
        });
}
