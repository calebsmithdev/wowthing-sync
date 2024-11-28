#[cfg_attr(mobile, tauri::mobile_entry_point)]

// Declare the internal namespaces
mod thing_api;
mod system_tray_menu;
mod setup;

// Import the references for the internal functions
use system_tray_menu::build_system_tray_menu;
use setup::{desktop::setup_desktop, mac::setup_mac};

// Import the external libraries
use tauri_plugin_store::StoreExt;

// #[cfg(target_os = "macos")]
// use cocoa::appkit::{NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = &app.handle();

            setup_mac(handle)?;
            setup_desktop(handle)?;
            build_system_tray_menu(handle)?;
            let _store = app.store(".settings.dat")?;

            Ok(())
        })
        // .on_system_tray_event(move |app, event| match event {
        //     SystemTrayEvent::DoubleClick {
        //         position: _,
        //         size: _,
        //         ..
        //     } => {
        //         let w = app.get_window("main").unwrap();
        //         w.show().unwrap();

        //         // because the window shows in a specific workspace and the user
        //         // can hide it and move to another, it will next show in the original
        //         // workspace it was opened in.
        //         // this is important for the window to always show in whatever workspace
        //         // the user moved to and is active in.
        //         w.set_focus().unwrap();
        //     }
        //     SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
        //         "quit" => {
        //             std::process::exit(0);
        //         }
        //         "restart" => {
        //             api::process::restart(&app.env());
        //         }
        //         "check-update" => {
        //             let w = app.get_window("main").unwrap();
        //             w.eval("window.checkForUpdates()").unwrap();
        //         }
        //         "show" => {
        //             let w = app.get_window("main").unwrap();
        //             w.show().unwrap();

        //             // because the window shows in a specific workspace and the user
        //             // can hide it and move to another, it will next show in the original
        //             // workspace it was opened in.
        //             // this is important for the window to always show in whatever workspace
        //             // the user moved to and is active in.
        //             w.set_focus().unwrap();
        //         }
        //         _ => {}
        //     },
        //     _ => {}
        // })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
              // don't kill the app when the user clicks close. this is important
              window.hide().unwrap();
              api.prevent_close();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![thing_api::submit_addon_data])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        });
}
