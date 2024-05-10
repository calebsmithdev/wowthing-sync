#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// Import the additional files
mod thing_api;
mod system_tray_menu;

use crate::system_tray_menu::build_system_tray_menu;
use crate::thing_api::submit_addon_data;

// #[cfg(target_os = "macos")]
// use cocoa::appkit::{NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};

use tauri::{Manager, api};
use tauri::{SystemTray, SystemTrayEvent};
use tauri_plugin_store::StoreBuilder;
use tauri_plugin_autostart::MacosLauncher;

fn main() {
    let tray_menu = build_system_tray_menu();

    tauri::Builder::default()
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_fs_watch::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--flag1", "--flag2"]))) /* arbitrary number of args to pass to the app */
        .system_tray(SystemTray::new().with_menu(tray_menu))
        .on_system_tray_event(move |app, event| match event {
            SystemTrayEvent::DoubleClick {
                position: _,
                size: _,
                ..
            } => {
                let w = app.get_window("main").unwrap();
                w.show().unwrap();

                // because the window shows in a specific workspace and the user
                // can hide it and move to another, it will next show in the original
                // workspace it was opened in.
                // this is important for the window to always show in whatever workspace
                // the user moved to and is active in.
                w.set_focus().unwrap();
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "quit" => {
                    std::process::exit(0);
                }
                "restart" => {
                    api::process::restart(&app.env());
                }
                "check-update" => {
                    let w = app.get_window("main").unwrap();
                    w.eval("window.checkForUpdates()").unwrap();
                }
                "show" => {
                    let w = app.get_window("main").unwrap();
                    w.show().unwrap();

                    // because the window shows in a specific workspace and the user
                    // can hide it and move to another, it will next show in the original
                    // workspace it was opened in.
                    // this is important for the window to always show in whatever workspace
                    // the user moved to and is active in.
                    w.set_focus().unwrap();
                }
                _ => {}
            },
            _ => {}
        })
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // don't kill the app when the user clicks close. this is important
                event.window().hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if !cfg!(debug_assertions) {
                // don't show on the taskbar/springboard
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            StoreBuilder::new(app.handle(), ".settings.dat".parse()?).build();
            Ok(())
          })
        .invoke_handler(tauri::generate_handler![submit_addon_data])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        });
}
