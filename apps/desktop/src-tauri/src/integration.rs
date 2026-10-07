//! Compile-time isolated runner for packaged/native integration. Production commands,
//! worker, capability validation, key migration and preferences remain in use.
//! Only OS services and the remote endpoint are synthetic.
use crate::{
    preferences::{Preferences, PreferencesState},
    sync_service::{SyncService, SyncStatus, WorkerIo},
};
use std::{path::PathBuf, sync::Arc};
use tauri::{Emitter, Manager};
const HARNESS_MARKER: &str = "WOWTHING_ISOLATED_HARNESS_V1";
pub(crate) fn root() -> PathBuf {
    let root = PathBuf::from(
        std::env::var_os("WOWTHING_TEST_ROOT").expect("isolated fixture root required"),
    );
    let root = root.canonicalize().expect("fixture root must exist");
    assert_eq!(
        std::fs::read_to_string(root.join("fixture-marker")).unwrap(),
        HARNESS_MARKER
    );
    root
}
struct Io {
    app: tauri::AppHandle,
    endpoint: String,
}
impl WorkerIo for Io {
    fn preferences(&self) -> Result<Arc<Preferences>, String> {
        crate::preferences::store(&self.app)
    }
    fn key(&self) -> Result<String, String> {
        self.app.state::<crate::credentials::SecretManager>().key()
    }
    fn reload(&self) {
        self.app
            .state::<crate::credentials::SecretManager>()
            .reload(&self.app);
    }
    fn emit(&self, status: &SyncStatus) {
        let _ = self.app.emit("sync-status", status);
    }
    fn effects(&self, success: bool, now: u64) -> Result<(), String> {
        if success {
            self.preferences()?
                .commit("last-success", Some(serde_json::json!(now)))?;
        }
        Ok(())
    }
    fn endpoint(&self) -> &str {
        &self.endpoint
    }
    fn client(&self) -> Result<reqwest::Client, String> {
        reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())
    }
}
#[tauri::command]
fn integration_report(app: tauri::AppHandle, errors: Vec<String>) {
    let status = app.state::<SyncService>().snapshot();
    let store = crate::preferences::store(&app).unwrap();
    let migrated = store.get("api-key").is_none() && root().join("synthetic-vault").exists();
    let passed = errors.is_empty() && status.last_success.is_some() && migrated;
    println!(
        "INTEGRATION_REPORT {}",
        serde_json::json!({"marker": HARNESS_MARKER, "passed":passed,"errors":errors,"version":env!("CARGO_PKG_VERSION"),"migrated":migrated,"status":status})
    );
    app.exit(if passed { 0 } else { 1 });
}
mod updater {
    #[tauri::command]
    pub fn check() -> Option<serde_json::Value> {
        None
    }
}
pub fn run() {
    let root = root();
    let endpoint = std::env::var("WOWTHING_TEST_ENDPOINT").expect("loopback endpoint required");
    let url = reqwest::Url::parse(&endpoint).expect("invalid fixture endpoint");
    assert!(
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    );
    let store =
        Arc::new(Preferences::load(root.join("settings.json")).expect("test settings failed"));
    let mut context = tauri::generate_context!();
    let mut window = context.config_mut().app.windows.remove(0);
    window.visible = true;
    tauri::Builder::default()
        .manage(PreferencesState(Ok(store)))
        .manage(crate::credentials::SecretManager::default())
        .manage(crate::settings::SettingsManager::default())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, serde_json::Value>::new("updater")
                .invoke_handler(tauri::generate_handler![updater::check])
                .build(),
        )
        .setup(move |app| {
            app.manage(SyncService::start_with_io(Io {
                app: app.handle().clone(),
                endpoint,
            }));
            tauri::WebviewWindowBuilder::from_config(app, &window)?
                .initialization_script(
                    include_str!("../../tests/e2e/native-integration.js")
                        .replace("__SMOKE_VERSION__", env!("CARGO_PKG_VERSION")),
                )
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::submit_addon_data::submit_addon_data,
            crate::sync_service::get_sync_status,
            crate::sync_service::sync_now,
            crate::credentials::get_api_key_status,
            crate::credentials::save_api_key,
            crate::settings::get_settings,
            crate::settings::save_sync_folder,
            crate::settings::set_autostart,
            crate::settings::set_notifications,
            crate::settings::default_wow_folder,
            integration_report
        ])
        .build(context)
        .expect("isolated native builder failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<SyncService>().shutdown();
            }
        });
}
