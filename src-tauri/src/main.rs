#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::collections::HashMap;

use reqwest;

// #[cfg(target_os = "macos")]
// use cocoa::appkit::{NSWindow, NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility};

use tauri::{command, Manager, SystemTraySubmenu, api};
use tauri::{CustomMenuItem, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use tauri_plugin_store::StoreBuilder;

#[command]
async fn submit_addon_data(api: &str, contents: &str) -> Result<String, String> {
    println!("Attempting to submit file...");
    
    let mut form_data = HashMap::new();
    form_data.insert("apiKey", api);
    form_data.insert("luaFile", contents);

    let client = reqwest::Client::new();
    let response = client.post("https://wowthing.org/api/upload/")
        .json(&form_data)
        .header("User-Agent", "WoWthing Sync - Tauri")
        .send()
        .await
        .unwrap();
        
    match response.status() {
        reqwest::StatusCode::OK => {
            match response.text().await {
                Ok(text) => Ok(format!("Sync completed: {:?}", text)),
                Err(_) => Err(format!("There was an issue reading the response.")),
            }
        }
        other => {
            Err(format!("Uh oh! Something unexpected happened: {:?}", other))
        }
    }
}


fn build_menu() -> SystemTrayMenu {
    let menuitem_quit = CustomMenuItem::new("quit".to_string(), "Quit");
    let menuitem_show = CustomMenuItem::new("show".to_string(), "Open Window");

    let submenu_preferences = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("logs", "View Logs"))
        .add_item(CustomMenuItem::new("check-update", "Check for Updates"))
        .add_item(CustomMenuItem::new("restart", "Restart App"));

    SystemTrayMenu::new()
        .add_item(menuitem_show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_submenu(SystemTraySubmenu::new("Preferences", submenu_preferences))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(menuitem_quit)
}

fn main() {
    let tray_menu = build_menu();

    tauri::Builder::default()
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_fs_watch::init())
        .plugin(tauri_plugin_store::Builder::default().build())
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
                "logs" => {
                    let w = app.get_window("main").unwrap();
                    w.eval("window.goToLink('/logs')").unwrap();
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
