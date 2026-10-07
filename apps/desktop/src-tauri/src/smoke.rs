//! Compile-time-only native webview smoke. This builder never initializes preferences,
//! credentials, autostart, notifications, real updater or the upload service.
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tauri::Emitter;

#[derive(Default)]
struct Fixture {
    saved: AtomicUsize,
    synced: AtomicBool,
}
fn status(synced: bool) -> Value {
    json!({"folder":"/fixture/_retail_", "hasApiKey":true, "files":["/fixture/collector.lua"], "isProcessing":false,
        "lastSuccess":if synced { Some(1791244800u64) } else { None }, "error":null, "pending":0, "failures":[], "warning":null,
        "uploads":if synced { json!({"/fixture/collector.lua": 1791244800u64}) } else { json!({}) }})
}
#[tauri::command]
fn get_sync_status(fixture: tauri::State<'_, Fixture>) -> Value {
    status(fixture.synced.load(Ordering::Acquire))
}
#[tauri::command]
fn get_settings() -> Value {
    json!({"folder":"/fixture/_retail_", "hasApiKey":true, "autoStart":false, "autoStartError":null, "notificationsEnabled":false, "notificationPermission":"unknown"})
}
#[tauri::command]
fn save_api_key(key: String, fixture: tauri::State<'_, Fixture>) -> Result<Value, String> {
    if key != "smoke-fixture-key" {
        return Err("Only the synthetic smoke fixture is accepted".into());
    }
    fixture.saved.fetch_add(1, Ordering::AcqRel);
    Ok(json!({"hasKey":true,"error":null}))
}
#[tauri::command]
fn sync_now(app: tauri::AppHandle, fixture: tauri::State<'_, Fixture>) -> Result<(), String> {
    fixture.synced.store(true, Ordering::Release);
    app.emit("sync-status", status(true))
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn smoke_report(app: tauri::AppHandle, fixture: tauri::State<'_, Fixture>, errors: Vec<String>) {
    let passed = errors.is_empty()
        && fixture.saved.load(Ordering::Acquire) == 1
        && fixture.synced.load(Ordering::Acquire);
    println!(
        "NATIVE_SMOKE {} {}",
        if passed { "PASS" } else { "FAIL" },
        json!({"errors":errors,"saved":fixture.saved.load(Ordering::Acquire),"synced":fixture.synced.load(Ordering::Acquire)})
    );
    app.exit(if passed { 0 } else { 1 });
}
mod updater {
    #[tauri::command]
    pub fn check() -> Option<serde_json::Value> {
        None // No updater endpoint is contacted in smoke builds.
    }
}
pub fn run() {
    let mut context = tauri::generate_context!();
    // Rebuild the configured main window to install automation before any application JS.
    let mut window = context.config_mut().app.windows.remove(0);
    window.visible = true;
    tauri::Builder::default()
        .manage(Fixture::default())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, serde_json::Value>::new("updater")
                .invoke_handler(tauri::generate_handler![updater::check])
                .build(),
        )
        .setup(move |app| {
            tauri::WebviewWindowBuilder::from_config(app, &window)?
                .initialization_script(
                    include_str!("../../tests/e2e/native-smoke.js")
                        .replace("__SMOKE_VERSION__", env!("CARGO_PKG_VERSION")),
                )
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sync_status,
            get_settings,
            save_api_key,
            sync_now,
            smoke_report
        ])
        .run(context)
        .expect("Native smoke webview failed");
}
