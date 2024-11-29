use tauri::AppHandle;
use tauri_plugin_autostart::MacosLauncher;

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    app.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--flag1", "--flag2"]), // arbitrary number of args to pass to your app
    ))?;
    app.plugin(tauri_plugin_updater::Builder::new().build())?;

    Ok(())
}
