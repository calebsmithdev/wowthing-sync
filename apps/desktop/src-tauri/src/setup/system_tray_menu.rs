use tauri::{
    menu::{MenuBuilder, MenuItem, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Listener, Manager,
};
use tauri_plugin_os::platform;

pub fn setup_system_tray_menu(handle: &AppHandle) -> tauri::Result<()> {
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

    let status_item = MenuItem::with_id(handle, "status", "Starting…", false, None::<&str>)?;
    let menu = MenuBuilder::new(handle)
        .item(&status_item)
        .item(&MenuItem::with_id(
            handle,
            "sync-now",
            "Sync Now",
            true,
            None::<&str>,
        )?)
        .separator()
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

    let mut tray_icon_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(is_macos)
        .icon(handle.default_window_icon().unwrap().clone())
        .on_menu_event(|app, event| dispatch_menu(app, event.id.as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // Show and focus the main window when the tray is clicked
                let is_macos = platform() == "macos";
                if !is_macos {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
            }
        });

    if cfg!(debug_assertions) {
        tray_icon_builder = tray_icon_builder.tooltip("Dev Mode");
    } else {
        tray_icon_builder = tray_icon_builder.tooltip("WoWthing Sync");
    }

    tray_icon_builder.build(handle)?;
    handle.listen_any("sync-status", move |event| {
        if let Ok(status) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            let _ = status_item.set_text(status_label(&status));
        }
    });
    Ok(())
}

/// One-line tray summary of the `sync-status` payload shown in the window.
fn status_label(status: &serde_json::Value) -> String {
    let flag = |key: &str| status[key].as_bool().unwrap_or(false);
    let present = |key: &str| !status[key].is_null();
    let failures = status["failures"].as_array().map_or(0, Vec::len);
    let files = status["files"].as_array().map_or(0, Vec::len);
    if !flag("hasApiKey") || !present("folder") {
        "Setup required".into()
    } else if present("error") || present("warning") || failures > 0 {
        "Needs attention".into()
    } else if flag("isProcessing") {
        "Syncing…".into()
    } else if status["pending"].as_u64().unwrap_or(0) > 0 {
        "Upload queued".into()
    } else {
        match files {
            1 => "Watching 1 account".into(),
            n => format!("Watching {n} accounts"),
        }
    }
}

/// Shared by real tray callbacks and compile-time native integration dispatch.
pub(crate) fn dispatch_menu(app: &AppHandle, id: &str) {
    match id {
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
        "sync-now" => {
            if let Some(service) = app.try_state::<crate::sync_service::SyncService>() {
                let _ = service.manual();
            }
        }
        "check-update" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("check-for-updates", serde_json::json!({ "source": "tray" }));
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::status_label;
    use serde_json::json;

    fn ready() -> serde_json::Value {
        json!({"folder":"/wow/_retail_","hasApiKey":true,"files":["a","b"],"isProcessing":false,
            "lastSuccess":null,"error":null,"pending":0,"failures":[],"warning":null})
    }

    #[test]
    fn tray_status_prioritizes_setup_then_problems_then_activity() {
        assert_eq!(status_label(&ready()), "Watching 2 accounts");
        let mut status = ready();
        status["isProcessing"] = json!(true);
        assert_eq!(status_label(&status), "Syncing…");
        status["failures"] = json!([{"file":"a","message":"HTTP 401"}]);
        assert_eq!(status_label(&status), "Needs attention");
        status["hasApiKey"] = json!(false);
        assert_eq!(status_label(&status), "Setup required");
        let mut queued = ready();
        queued["pending"] = json!(1);
        queued["files"] = json!(["a"]);
        assert_eq!(status_label(&queued), "Upload queued");
        queued["pending"] = json!(0);
        assert_eq!(status_label(&queued), "Watching 1 account");
    }
}
