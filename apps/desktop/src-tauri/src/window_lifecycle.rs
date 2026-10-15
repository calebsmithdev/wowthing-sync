use tauri::{AppHandle, Emitter, Manager};

/// Restore a hidden or minimized main window and resume its display clock.
pub(crate) fn reveal_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("Could not reveal main window: window is missing");
        return;
    };
    if let Err(error) = window.unminimize() {
        log::error!("Could not unminimize main window: {error}");
    }
    if let Err(error) = window.show() {
        log::error!("Could not show main window: {error}");
        return;
    }
    if let Err(error) = window.set_focus() {
        log::error!("Could not focus main window: {error}");
    }
    if let Err(error) = window.emit("window-visibility", true) {
        log::error!("Could not emit main window visibility: {error}");
    }
}

pub(crate) fn on_second_instance(app: &AppHandle, _args: &[String]) {
    reveal_main(app);
}

/// macOS relaunches an existing application through its delegate, without
/// starting a second process. Ready is deliberately ignored: startup visibility
/// is owned by setup, including any hidden login launch policy.
pub(crate) fn on_run_event(app: &AppHandle, event: &tauri::RunEvent) {
    #[cfg(target_os = "macos")]
    if matches!(event, tauri::RunEvent::Reopen { .. }) {
        reveal_main(app);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, event);
}

/// Close keeps the app-lifetime worker alive. Real and isolated builders use this.
pub(crate) fn on_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if let Err(error) = window.hide() {
            log::error!("Could not hide window: {error}");
        } else {
            let _ = window.emit("window-visibility", false);
        }
        api.prevent_close();
    } else if matches!(
        event,
        tauri::WindowEvent::Focused(_) | tauri::WindowEvent::Resized(_)
    ) {
        if let (Ok(visible), Ok(minimized)) = (window.is_visible(), window.is_minimized()) {
            let _ = window.emit("window-visibility", visible && !minimized);
        }
    }
}
