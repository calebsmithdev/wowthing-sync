use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(desktop)]
    {
        app.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))?;
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
        let _ = app.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            crate::window_lifecycle::on_second_instance(app, &args);
        }));

        // Show the main window when the app loads
        let main_window = app.get_webview_window("main").expect("no main window");
        main_window.show()?;
        main_window.set_focus()?;
    }

    #[cfg(not(desktop))]
    let _ = app; // Prevent unused variable warning on non-macOS platforms

    Ok(())
}
