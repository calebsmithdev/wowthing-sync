use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(desktop)]
    {
        app.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]), // arbitrary number of args to pass to your app
        ))?;
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
        let _ = app.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
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
