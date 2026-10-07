/// Close keeps the app-lifetime worker alive. Real and isolated builders use this.
pub(crate) fn on_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if let Err(error) = window.hide() {
            log::error!("Could not hide window: {error}");
        }
        api.prevent_close();
    }
}
