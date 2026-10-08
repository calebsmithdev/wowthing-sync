//! Compile-time isolated runner for packaged/native integration. Production commands,
//! worker, capability validation, key migration and preferences remain in use.
//! Only OS services and the remote endpoint are synthetic.
use crate::{
    preferences::{Preferences, PreferencesState},
    sync_service::{SyncService, SyncStatus, WorkerIo},
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
};
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
    fn key(&self) -> Result<Option<String>, String> {
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
    let counts = app.state::<Arc<Counts>>();
    let resources_closed = counts.created.load(Ordering::Acquire) >= 3
        && counts.created.load(Ordering::Acquire) == counts.closed.load(Ordering::Acquire);
    let lifecycle =
        counts.hidden.load(Ordering::Acquire) && counts.reopened.load(Ordering::Acquire);
    let lifecycle_details = serde_json::json!({
        "hidden": counts.hidden.load(Ordering::Acquire),
        "reopenRequested": counts.reopen_requested.load(Ordering::Acquire),
        "reopened": counts.reopened.load(Ordering::Acquire),
    });
    let updater = counts.downloads.load(Ordering::Acquire) == 2
        && counts.relaunched.load(Ordering::Acquire) == 1;
    let passed = errors.is_empty()
        && status.failures.is_empty()
        && !status.is_processing
        && status.pending == 0
        && status.last_success.is_some()
        && migrated
        && resources_closed
        && lifecycle
        && updater;
    println!(
        "INTEGRATION_REPORT {}",
        serde_json::json!({"marker": HARNESS_MARKER, "passed":passed,"errors":errors,"version":env!("CARGO_PKG_VERSION"),"migrated":migrated,"resourcesClosed":resources_closed,"windowLifecycle":lifecycle,"windowLifecycleDetails":lifecycle_details,"updater":updater,"status":status})
    );
    app.exit(if passed { 0 } else { 1 });
}
#[path = "setup/system_tray_menu.rs"]
mod tray;
#[derive(Default)]
struct Counts {
    mode: AtomicUsize,
    created: AtomicUsize,
    closed: AtomicUsize,
    downloads: AtomicUsize,
    relaunched: AtomicUsize,
    hydrate_failed: AtomicBool,
    invalid_folder: AtomicBool,
    hidden: AtomicBool,
    reopen_requested: AtomicBool,
    reopened: AtomicBool,
}
#[tauri::command]
async fn save_sync_folder(
    app: tauri::AppHandle,
    folder: String,
) -> Result<crate::settings::SettingsSnapshot, String> {
    let selected = std::path::Path::new(&folder)
        .canonicalize()
        .map_err(|_| "Synthetic folder unavailable".to_string())?;
    if !selected.starts_with(root()) {
        return Err("Folder must remain inside the isolated fixture".into());
    }
    crate::settings::save_sync_folder(app, folder).await
}
#[tauri::command]
async fn get_settings(app: tauri::AppHandle) -> Result<crate::settings::SettingsSnapshot, String> {
    if !app
        .state::<Arc<Counts>>()
        .hydrate_failed
        .swap(true, Ordering::AcqRel)
    {
        return Err("Synthetic transient settings bridge failure".into());
    }
    crate::settings::get_settings(app).await
}
#[tauri::command]
fn integration_control(app: tauri::AppHandle, action: String) -> Result<serde_json::Value, String> {
    let counts = app.state::<Arc<Counts>>();
    let window = app
        .get_webview_window("main")
        .ok_or("missing fixture window")?;
    match action.as_str() {
        "invalid-folder" => counts.invalid_folder.store(true, Ordering::Release),
        "valid-folder" => counts.invalid_folder.store(false, Ordering::Release),
        "update-failure" => counts.mode.store(1, Ordering::Release),
        "update-success" => counts.mode.store(2, Ordering::Release),
        "write" => {
            use std::io::Write;
            let dir = cap_std::fs::Dir::open_ambient_dir(root(), cap_std::ambient_authority())
                .map_err(|e| e.to_string())?;
            let mut options = cap_std::fs::OpenOptions::new();
            options.write(true);
            #[cfg(unix)]
            {
                use cap_std::fs::OpenOptionsExt;
                options.custom_flags(libc::O_NONBLOCK);
            }
            let mut file = dir.open_with("WoW Unicode 雪 with spaces/_retail_/WTF/Account/SYNTHETIC/SavedVariables/WoWthing_Collector.lua", &options).map_err(|e| e.to_string())?;
            if !file.metadata().map_err(|e| e.to_string())?.is_file() {
                return Err("fixture collector must be regular".into());
            }
            file.set_len(0).map_err(|e| e.to_string())?;
            file.write_all(b"synthetic write during native navigation")
                .map_err(|e| e.to_string())?;
        }
        "close" => window.close().map_err(|e| e.to_string())?,
        "show" => {
            tray::dispatch_menu(&app, "show");
            counts.reopen_requested.store(true, Ordering::Release);
        }
        "tray-update" => tray::dispatch_menu(&app, "check-update"),
        "state" => {}
        _ => return Err("unknown fixture control".into()),
    }
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if action == "state" {
        // Show/hide dispatch is asynchronous on GTK. Record the transition from
        // the same native observation the frontend actually waits for.
        if !visible {
            counts.hidden.store(true, Ordering::Release);
        } else if counts.hidden.load(Ordering::Acquire)
            && counts.reopen_requested.load(Ordering::Acquire)
        {
            counts.reopened.store(true, Ordering::Release);
        }
    }
    Ok(
        serde_json::json!({"visible": visible, "created":counts.created.load(Ordering::Acquire), "closed":counts.closed.load(Ordering::Acquire), "downloads":counts.downloads.load(Ordering::Acquire), "relaunched":counts.relaunched.load(Ordering::Acquire)}),
    )
}
mod dialog {
    #[tauri::command]
    pub fn open(app: tauri::AppHandle) -> Result<String, String> {
        if app
            .state::<std::sync::Arc<super::Counts>>()
            .invalid_folder
            .load(std::sync::atomic::Ordering::Acquire)
        {
            Ok(super::root()
                .join("not-a-wow-folder")
                .to_string_lossy()
                .into_owned())
        } else {
            crate::preferences::store(&app)?
                .get("program-folder")
                .and_then(|v| v.as_str().map(String::from))
                .ok_or("missing fixture folder".into())
        }
    }
    use tauri::Manager;
}
mod updater {
    use super::*;
    struct TrackedUpdate(Arc<Counts>);
    impl tauri::Resource for TrackedUpdate {}
    impl Drop for TrackedUpdate {
        fn drop(&mut self) {
            self.0.closed.fetch_add(1, Ordering::AcqRel);
        }
    }
    #[tauri::command]
    pub fn check(app: tauri::AppHandle) -> Option<serde_json::Value> {
        let counts = app.state::<Arc<Counts>>();
        if counts.mode.load(Ordering::Acquire) == 0 {
            return None;
        }
        counts.created.fetch_add(1, Ordering::AcqRel);
        let rid = app
            .resources_table()
            .add(TrackedUpdate(counts.inner().clone()));
        Some(
            serde_json::json!({"rid":rid,"version":"9.9.9","currentVersion":env!("CARGO_PKG_VERSION"),"body":"Synthetic native update","rawJson":{}}),
        )
    }
    #[tauri::command]
    pub fn download_and_install(
        app: tauri::AppHandle,
        rid: u32,
        on_event: tauri::ipc::Channel<serde_json::Value>,
    ) -> Result<(), String> {
        let _resource = app
            .resources_table()
            .get::<TrackedUpdate>(rid)
            .map_err(|e| e.to_string())?;
        let counts = app.state::<Arc<Counts>>();
        counts.downloads.fetch_add(1, Ordering::AcqRel);
        if counts.mode.load(Ordering::Acquire) == 1 {
            return Err("Synthetic installer failure".into());
        }
        on_event
            .send(serde_json::json!({"event":"Started","data":{"contentLength":10}}))
            .map_err(|e| e.to_string())?;
        on_event
            .send(serde_json::json!({"event":"Progress","data":{"chunkLength":10}}))
            .map_err(|e| e.to_string())?;
        on_event
            .send(serde_json::json!({"event":"Finished"}))
            .map_err(|e| e.to_string())
    }
}
mod process {
    use super::*;
    #[tauri::command]
    pub fn restart(app: tauri::AppHandle) -> Result<(), String> {
        let counts = app.state::<Arc<Counts>>();
        if counts.created.load(Ordering::Acquire) != counts.closed.load(Ordering::Acquire) {
            return Err("Updater resource still open at restart".into());
        }
        counts.relaunched.fetch_add(1, Ordering::AcqRel);
        Ok(())
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
    let folder = store
        .get("program-folder")
        .and_then(|v| v.as_str().map(String::from))
        .expect("isolated WoW folder required");
    assert!(std::path::Path::new(&folder)
        .canonicalize()
        .expect("isolated WoW folder unavailable")
        .starts_with(&root));
    let mut context = tauri::generate_context!();
    let mut window = context.config_mut().app.windows.remove(0);
    window.visible = true;
    let builder = tauri::Builder::default()
        .manage(Arc::new(Counts::default()))
        .manage(PreferencesState(Ok(store)))
        .manage(crate::credentials::SecretManager::default())
        .manage(crate::settings::SettingsManager::default());
    let updater_test = std::env::var("WOWTHING_UPDATER_TEST").as_deref() == Ok("1");
    let builder = if updater_test {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    } else {
        builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, serde_json::Value>::new("updater")
                .invoke_handler(tauri::generate_handler![
                    updater::check,
                    updater::download_and_install
                ])
                .build(),
        )
    };
    builder
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, serde_json::Value>::new("dialog")
                .invoke_handler(tauri::generate_handler![dialog::open])
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, serde_json::Value>::new("process")
                .invoke_handler(tauri::generate_handler![process::restart])
                .build(),
        )
        .on_window_event(crate::window_lifecycle::on_event)
        .setup(move |app| {
            app.manage(SyncService::start_with_io(Io {
                app: app.handle().clone(),
                endpoint,
            }));
            tauri::WebviewWindowBuilder::from_config(app, &window)?
                .initialization_script(
                    (if updater_test {
                        include_str!("../../tests/e2e/native-updater.js")
                    } else {
                        include_str!("../../tests/e2e/native-integration.js")
                    })
                    .replace("__SMOKE_VERSION__", env!("CARGO_PKG_VERSION")),
                )
                .build()?;
            tray::setup_system_tray_menu(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::submit_addon_data::submit_addon_data,
            crate::sync_service::get_sync_status,
            crate::sync_service::sync_now,
            crate::credentials::get_api_key_status,
            crate::credentials::save_api_key,
            get_settings,
            save_sync_folder,
            crate::settings::set_autostart,
            crate::settings::set_notifications,
            crate::settings::default_wow_folder,
            integration_control,
            integration_report,
            crate::updater_fixture::updater_fixture
        ])
        .build(context)
        .expect("isolated native builder failed")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app.state::<SyncService>().shutdown();
            }
        });
}
