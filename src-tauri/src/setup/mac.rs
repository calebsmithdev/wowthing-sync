use tauri::AppHandle;

#[cfg(target_os = "macos")]
pub fn setup_mac(app: &AppHandle) -> tauri::Result<()> {
    // Ignore if in dev mode for easier testing
    if !cfg!(debug_assertions) {
        // don't show on the taskbar/springboard
        app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;
    }

    Ok(())
}
