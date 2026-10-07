#[cfg(all(
    feature = "os-integration-test",
    any(feature = "smoke-test", feature = "integration-test")
))]
compile_error!("OS probe cannot combine with another automation harness");
#[cfg(feature = "os-integration-test")]
mod os_integration;
#[cfg(feature = "os-integration-test")]
pub fn run_os_integration() {
    os_integration::run();
}
#[cfg(all(feature = "smoke-test", feature = "integration-test"))]
compile_error!("automation harness features are mutually exclusive");
#[cfg(not(any(feature = "smoke-test", feature = "integration-test")))]
use tauri::Manager;
// Declare the internal namespaces
#[cfg(not(feature = "smoke-test"))]
mod collector_fs;
#[cfg(not(feature = "smoke-test"))]
mod commands;
#[cfg(not(feature = "smoke-test"))]
mod credentials;
#[cfg(feature = "integration-test")]
mod integration;
#[cfg(not(feature = "smoke-test"))]
mod preferences;
#[cfg(not(feature = "smoke-test"))]
mod settings;
#[cfg(not(any(feature = "smoke-test", feature = "integration-test")))]
mod setup;
#[cfg(feature = "smoke-test")]
mod smoke;
#[cfg(not(feature = "smoke-test"))]
mod sync_queue;
#[cfg(not(feature = "smoke-test"))]
mod sync_service;
#[cfg(feature = "integration-test")]
mod updater_fixture;
#[cfg(not(feature = "smoke-test"))]
mod window_lifecycle;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(feature = "smoke-test")]
    smoke::run();
    #[cfg(feature = "integration-test")]
    integration::run();
    #[cfg(not(any(feature = "smoke-test", feature = "integration-test")))]
    tauri::Builder::default()
        .on_permission_request(|_, kind| setup::permissions::webview_permission_response(kind))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let handle = &app.handle();

            setup::mac::setup_mac(handle)?;
            setup::desktop::setup_desktop(handle)?;
            setup::system_tray_menu::setup_system_tray_menu(handle)?;
            setup::logs::setup_logs(handle)?;

            app.manage(preferences::initialize(app.handle()));
            app.manage(credentials::SecretManager::default());
            app.manage(settings::SettingsManager::default());
            app.manage(sync_service::SyncService::start(app.handle().clone()));
            Ok(())
        })
        .on_window_event(window_lifecycle::on_event)
        .invoke_handler(tauri::generate_handler![
            commands::submit_addon_data::submit_addon_data,
            sync_service::get_sync_status,
            sync_service::sync_now,
            credentials::get_api_key_status,
            credentials::save_api_key,
            settings::get_settings,
            settings::save_sync_folder,
            settings::set_autostart,
            settings::set_notifications,
            settings::default_wow_folder
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
