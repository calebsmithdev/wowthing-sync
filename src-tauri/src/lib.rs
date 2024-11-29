// Declare the internal namespaces
mod setup;
mod system_tray_menu;
mod thing_api;

// Import the references for the internal functions
use setup::{desktop::setup_desktop, mac::setup_mac};
use system_tray_menu::build_system_tray_menu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = &app.handle();

            setup_mac(handle)?;
            setup_desktop(handle)?;
            build_system_tray_menu(handle)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Don't kill the app when the user clicks close
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![thing_api::submit_addon_data])
        .run(tauri::generate_context!())
        .expect("Error while building the Wowthing Sync application");
}
