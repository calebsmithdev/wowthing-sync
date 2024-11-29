use tauri::AppHandle;

pub fn setup_mac(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        // don't show on the taskbar/springboard
        app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = app; // Prevent unused variable warning on non-macOS platforms

    Ok(())
}
