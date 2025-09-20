use tauri::{AppHandle, Manager};

pub fn setup_mac(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        if !cfg!(debug_assertions) {
            // don't show on the taskbar/springboard
            app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;
        }

        if let Some(window) = app.get_webview_window("main") {
            // Hide the title near the traffic light controls on macOS
            let _ = window.set_title("");
        }
    }

    #[cfg(not(target_os = "macos"))]
    let _ = app; // Prevent unused variable warning on non-macOS platforms

    Ok(())
}
