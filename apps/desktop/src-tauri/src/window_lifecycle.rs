/// Close keeps the app-lifetime worker alive. Real and isolated builders use this.
pub(crate) fn on_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    use tauri::Emitter;
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
