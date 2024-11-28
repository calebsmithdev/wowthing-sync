use tauri::AppHandle;
use tauri_plugin_autostart::MacosLauncher;

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(desktop)]
    app.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--flag1", "--flag2"]), // arbitrary number of args to pass to your app
    ))?;

    #[cfg(desktop)]
    app.plugin(tauri_plugin_updater::Builder::new().build())?;

    Ok(())
}
