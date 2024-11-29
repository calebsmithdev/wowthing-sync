use tauri::AppHandle;

pub fn setup_mac(app: &AppHandle) -> tauri::Result<()> {
    // don't show on the taskbar/springboard
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;

    Ok(())
}
