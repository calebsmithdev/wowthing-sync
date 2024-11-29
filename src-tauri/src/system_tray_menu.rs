use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder}, tray::{  TrayIconBuilder}, AppHandle, Manager
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

    TrayIconBuilder::new()
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
            "show" => {
                let w = app.get_webview_window("main").unwrap();
                w.show().unwrap();
                w.set_focus().unwrap();
            }
            "check-update" => {
                let w = app.get_webview_window("main").unwrap();
                w.eval("window.checkForUpdates()").unwrap();
            }
            _ => {
                println!("Unhandled menu event {event:?}");
            }
        })
        .build(handle)?;
    Ok(())
}
