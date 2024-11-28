use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, AppHandle, Manager
};

pub fn build_system_tray_menu(handle: &AppHandle) -> tauri::Result<()> {
    let preferences_sub_menu = SubmenuBuilder::new(handle, "Preferences")
        .item(&MenuItem::with_id(handle, "logs", "Logs", true, None::<&str>)?)
        .item(&MenuItem::with_id(handle, "check-update", "Check for Updates", true, None::<&str>)?)
        .item(&MenuItem::with_id(handle, "restart", "Restart App", true, None::<&str>)?)
        .build()?;

    let menu = MenuBuilder::new(handle)
        .item(&MenuItem::with_id(handle, "show", "Open Window", true, None::<&str>)?)
        .separator()
        .item(&preferences_sub_menu)
        .separator()
        .item(&MenuItem::with_id(handle, "quit", "Quit", true, None::<&str>)?)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .menu_on_left_click(true)
        .icon(handle.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "restart" => {
                tauri::process::restart(&app.env());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {
                println!("Unhandled menu event {event:?}");
            }
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                let w = tray.app_handle().get_webview_window("main").unwrap();
                w.show().unwrap();
                w.set_focus().unwrap();
            }
            _ => {
                println!("Unhandled tray icon menu event {event:?}");
            }
        })
        .build(handle)?;

    Ok(())
}
