use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    app.plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--flag1", "--flag2"]), // arbitrary number of args to pass to your app
    ))?;
    app.plugin(tauri_plugin_updater::Builder::new().build())?;
    app.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        let w = app.get_webview_window("main").unwrap();
        w.show().unwrap();
        w.set_focus().unwrap();
    }));

    Ok(())
}
