use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_os::platform;

pub fn build_system_tray_menu(handle: &AppHandle) -> tauri::Result<()> {
    let is_macos = platform() == "macos";
    let preferences_sub_menu = SubmenuBuilder::new(handle, "Preferences")
        // .item(&MenuItem::with_id(
        //     handle,
        //     "logs",
        //     "Logs",
        //     true,
        //     None::<&str>,
        // )?)
        .item(&MenuItem::with_id(
            handle,
            "check-update",
            "Check for Updates",
            true,
            None::<&str>,
        )?)
        .item(&MenuItem::with_id(
            handle,
            "restart",
            "Restart App",
            true,
            None::<&str>,
        )?)
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&MenuItem::with_id(
            handle,
            "show",
            "Open Window",
            true,
            None::<&str>,
        )?)
        .separator()
        .item(&preferences_sub_menu)
        .separator()
        .item(&MenuItem::with_id(
            handle,
            "quit",
            "Quit",
            true,
            None::<&str>,
        )?)
        .build()?;

    TrayIconBuilder::new()
        .menu(&menu)
        .menu_on_left_click(is_macos)
        .icon(handle.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "restart" => {
                tauri::process::restart(&app.env());
            }
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
            "check-update" => {
                let w = app.get_webview_window("main").unwrap();
                w.eval("window.checkForUpdates()").unwrap();
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                // Show and focus the main window when the tray is clicked
                let is_macos = platform() == "macos";
                if !is_macos
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
            }
            _ => {}
        })
        .build(handle)?;
    Ok(())
}
