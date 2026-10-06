//! App-lifetime collector discovery. The worker belongs to the native app, never a page.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub folder: Option<String>,
    pub files: Vec<String>,
    pub is_processing: bool,
    pub last_success: Option<u64>,
    pub error: Option<String>,
    pub pending: usize,
    pub failures: Vec<FileFailure>,
    pub warning: Option<String>,
}
#[derive(Clone, PartialEq, Serialize)]
pub struct FileFailure {
    pub file: String,
    pub message: String,
}
impl SyncStatus {
    fn finish_upload(
        &mut self,
        file: &Path,
        outcome: Result<(), String>,
        now: u64,
        effects: impl FnOnce(bool, u64) -> Result<(), String>,
    ) {
        let successful = outcome.is_ok();
        self.record_upload(file, outcome, now);
        self.warning = effects(successful, now).err();
    }
    fn record_upload(&mut self, file: &Path, outcome: Result<(), String>, now: u64) {
        self.is_processing = false;
        let file = file.to_string_lossy().into_owned();
        self.failures.retain(|failure| failure.file != file);
        match outcome {
            Ok(()) => self.last_success = Some(now),
            Err(message) => self.failures.push(FileFailure { file, message }),
        }
    }
}
pub(crate) fn validate_folder(folder: &Path) -> Result<Vec<PathBuf>, String> {
    if !folder.is_dir() || !folder.join("WTF/Account").is_dir() {
        return Err(
            "Choose the World of Warcraft _retail_ folder containing WTF/Account in Settings."
                .into(),
        );
    }
    let files = discover(folder)?;
    if files.is_empty() {
        return Err("No WoWthing_Collector.lua files found. Enable the collector addon and log out of WoW, then choose the folder again.".into());
    }
    Ok(files)
}
fn stored_last_success(value: Option<serde_json::Value>) -> Option<u64> {
    let value = value?;
    value.as_u64().or_else(|| {
        chrono::DateTime::parse_from_rfc3339(value.as_str()?)
            .ok()?
            .timestamp()
            .try_into()
            .ok()
    })
}
fn ready_store(app: &tauri::AppHandle) -> Result<(), String> {
    let store = app
        .store(".settings.dat")
        .map_err(|_| "Could not read Settings. Reopen Settings and try again.".to_string())?;
    if !store
        .get("api-key")
        .is_some_and(|v| v.as_str().is_some_and(|key| !key.trim().is_empty()))
    {
        return Err("Configure your WoWthing API key in Settings.".into());
    }
    Ok(())
}
fn upload_effects(app: &tauri::AppHandle, successful: bool, now: u64) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    let store = app
        .store(".settings.dat")
        .map_err(|_| "Could not access sync preferences".to_string())?;
    let mut errors = Vec::new();
    if successful {
        store.set("last-success", serde_json::json!(now));
        if store.save().is_err() {
            errors.push("Upload succeeded, but its timestamp could not be saved.");
        }
    }
    if store
        .get("notifications-enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        match app.notification().permission_state() {
            Ok(tauri_plugin_notification::PermissionState::Granted) => {
                if app
                    .notification()
                    .builder()
                    .title("WoWthing Sync")
                    .body(if successful {
                        "Collector file uploaded successfully."
                    } else {
                        "A collector upload failed. Open the app for details."
                    })
                    .show()
                    .is_err()
                {
                    errors.push(
                        "Desktop notification failed. Sync results remain available in the app.",
                    );
                }
            }
            Ok(_) => {} // Background work never prompts for permission.
            Err(_) => errors.push("Could not check desktop notification permission."),
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join(" "))
    }
}
enum Request {
    Configure(u64, Option<String>),
    File(PathBuf),
    Manual,
    Shutdown,
}
pub struct SyncService {
    sender: mpsc::Sender<Request>,
    status: Arc<Mutex<SyncStatus>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    stopping: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
}
impl SyncService {
    pub fn start(app: tauri::AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel();
        let status = Arc::new(Mutex::new(SyncStatus::default()));
        let worker_status = status.clone();
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stopping = stopping.clone();
        let generation = Arc::new(AtomicU64::new(0));
        let worker_generation = generation.clone();
        let worker = thread::spawn(move || {
            run(
                app,
                receiver,
                worker_status,
                worker_stopping,
                worker_generation,
            )
        });
        Self {
            stopping,
            generation,
            sender,
            status,
            worker: Mutex::new(Some(worker)),
        }
    }
    pub fn configure(&self, folder: Option<String>) -> Result<(), String> {
        if let Some(folder) = &folder {
            validate_folder(Path::new(folder))?;
        }
        self.sender
            .send(Request::Configure(
                self.generation.fetch_add(1, Ordering::AcqRel) + 1,
                folder,
            ))
            .map_err(|_| "Sync service stopped".into())
    }
    pub fn enqueue_file(&self, file: String) -> Result<(), String> {
        self.sender
            .send(Request::File(PathBuf::from(file)))
            .map_err(|_| "Sync service stopped".into())
    }
    pub fn manual(&self) -> Result<(), String> {
        self.sender
            .send(Request::Manual)
            .map_err(|_| "Sync service stopped".into())
    }
    pub fn snapshot(&self) -> SyncStatus {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    pub fn shutdown(&self) {
        self.stopping.store(true, Ordering::Release);
        let _ = self.sender.send(Request::Shutdown);
        if let Some(worker) = self.worker.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = worker.join();
        }
    }
}
impl Drop for SyncService {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn publish(app: &tauri::AppHandle, status: &Arc<Mutex<SyncStatus>>, value: &SyncStatus) {
    let mut current = status.lock().unwrap_or_else(|e| e.into_inner());
    if *current == *value {
        return;
    }
    *current = value.clone();
    drop(current);
    let _ = app.emit("sync-status", value);
}

/// Rescan directories, rather than holding handles to individual files: rename/replace and
/// new account folders are discovered even when no frontend is mounted.
pub(crate) fn discover(folder: &Path) -> Result<Vec<PathBuf>, String> {
    fn visit(path: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
        for entry in
            std::fs::read_dir(path).map_err(|e| format!("Cannot read account folder: {e}"))?
        {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_dir() {
                visit(&entry.path(), files)?;
            } else if kind.is_file() && entry.file_name() == "WoWthing_Collector.lua" {
                files.push(entry.path());
            }
        }
        Ok(())
    }
    let mut files = Vec::new();
    visit(&folder.join("WTF/Account"), &mut files)?;
    files.sort();
    Ok(files)
}
fn fingerprints(files: &[PathBuf]) -> Result<BTreeMap<PathBuf, u64>, String> {
    use std::hash::{Hash, Hasher};
    files
        .iter()
        .map(|p| {
            let contents = std::fs::read(p).map_err(|e| e.to_string())?;
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            contents.hash(&mut hasher);
            Ok((p.clone(), hasher.finish()))
        })
        .collect()
}
fn run(
    app: tauri::AppHandle,
    receiver: mpsc::Receiver<Request>,
    shared: Arc<Mutex<SyncStatus>>,
    stopping: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
) {
    let mut state = SyncStatus::default();
    match app.store(".settings.dat") {
        Ok(store) => {
            state.folder = store
                .get("program-folder")
                .and_then(|v| v.as_str().map(String::from));
            state.last_success = stored_last_success(
                store
                    .get("last-success")
                    .or_else(|| store.get("last-updated")),
            )
        }
        Err(e) => state.error = Some(e.to_string()),
    }
    let client = match crate::commands::submit_addon_data::http_client() {
        Ok(client) => client,
        Err(error) => {
            state.error = Some(error);
            publish(&app, &shared, &state);
            return;
        }
    };
    let mut previous = BTreeMap::new();
    let mut queue = crate::sync_queue::SyncQueue::default();
    let mut active_generation = 0;
    publish(&app, &shared, &state);
    while !stopping.load(Ordering::Acquire) {
        let request = match receiver.recv_timeout(Duration::from_millis(500)) {
            Ok(request) => Some(request),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => None,
        };
        let mut manual = false;
        for request in request.into_iter().chain(receiver.try_iter()) {
            match request {
                Request::Shutdown => return,
                Request::Configure(epoch, folder) => {
                    active_generation = epoch;
                    state.folder = folder;
                    previous.clear();
                    queue = Default::default();
                    state.files.clear();
                    state.is_processing = false;
                    state.pending = 0;
                    state.error = None;
                    state.failures.clear();
                    state.warning = None;
                    manual = false;
                    publish(&app, &shared, &state);
                }
                Request::Manual => manual = true,
                Request::File(file) => queue.manual([file], Instant::now()),
            }
        }
        let Some(folder) = &state.folder else {
            state.error = Some("Choose your World of Warcraft _retail_ folder in Settings.".into());
            publish(&app, &shared, &state);
            continue;
        };
        if let Err(error) = ready_store(&app) {
            state.error = Some(error);
            publish(&app, &shared, &state);
            continue;
        }
        let result = validate_folder(Path::new(folder))
            .and_then(|files| fingerprints(&files).map(|prints| (files, prints)));
        let (files, prints) = match result {
            Ok(result) => result,
            Err(error) => {
                state.error = Some(error);
                state.files.clear();
                // Keep pending settled changes and their deadlines through transient scan errors.
                state.pending = queue.len();
                publish(&app, &shared, &state);
                continue;
            }
        };
        state.error = None;
        state.files = files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        queue.retain(&files);
        let now = Instant::now();
        for file in &files {
            if previous.get(file) != prints.get(file) {
                queue.changed(file.clone(), now);
            }
        }
        if manual {
            queue.manual(files, now);
        }
        previous = prints;
        state.pending = queue.len();
        publish(&app, &shared, &state);
        let Some(file) = queue.take_ready(now) else {
            continue;
        };
        state.is_processing = true;
        state.pending = queue.len();
        state.error = None;
        publish(&app, &shared, &state);
        let file_path = file.to_string_lossy();
        let outcome = tauri::async_runtime::block_on(async {
            tokio::select! {
                result = crate::commands::submit_addon_data::upload_file(&app, &client, &file_path) => Some(result),
                () = async { while !stopping.load(Ordering::Acquire) && generation.load(Ordering::Acquire) == active_generation { tokio::time::sleep(Duration::from_millis(50)).await; } } => None,
            }
        });
        state.is_processing = false;
        if generation.load(Ordering::Acquire) != active_generation {
            continue;
        }
        if let Some(outcome) = outcome {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            state.finish_upload(&file, outcome.map(|_| ()), now, |successful, now| {
                upload_effects(&app, successful, now)
            });
        }
        publish(&app, &shared, &state);
    }
}
#[tauri::command]
pub fn get_sync_status(service: tauri::State<'_, SyncService>) -> SyncStatus {
    service.snapshot()
}
#[tauri::command]
pub fn configure_sync(
    service: tauri::State<'_, SyncService>,
    folder: Option<String>,
) -> Result<(), String> {
    service.configure(folder)
}
#[tauri::command]
pub fn sync_now(service: tauri::State<'_, SyncService>) -> Result<(), String> {
    service.manual()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_and_empty_account_folders_are_errors() {
        let root = std::env::temp_dir().join(format!("wowthing-empty-{}", std::process::id()));
        assert!(validate_folder(&root).is_err());
        std::fs::create_dir_all(root.join("WTF/Account")).unwrap();
        assert!(validate_folder(&root).unwrap_err().contains("No WoWthing"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn partial_failure_remains_visible_after_another_file_succeeds() {
        let mut status = SyncStatus {
            is_processing: true,
            ..Default::default()
        };
        status.record_upload(
            Path::new("failed.lua"),
            Err("authentication failed".into()),
            1,
        );
        assert!(!status.is_processing);
        assert_eq!(status.last_success, None);
        status.is_processing = true;
        status.record_upload(Path::new("successful.lua"), Ok(()), 2);
        assert!(!status.is_processing);
        assert_eq!(status.last_success, Some(2));
        assert_eq!(status.failures.len(), 1);
        status.record_upload(Path::new("failed.lua"), Ok(()), 3);
        assert!(status.failures.is_empty());
        assert_eq!(status.last_success, Some(3));
    }
    #[test]
    fn storage_and_notification_failures_do_not_erase_success_or_leave_processing() {
        for failure in ["storage failed", "notification failed"] {
            let mut status = SyncStatus {
                is_processing: true,
                ..Default::default()
            };
            status.finish_upload(Path::new("collector.lua"), Ok(()), 2, |_, _| {
                Err(failure.into())
            });
            assert!(!status.is_processing);
            assert_eq!(status.last_success, Some(2));
            assert_eq!(status.warning.as_deref(), Some(failure));
        }
    }
    #[test]
    fn migrates_legacy_success_dates_and_ignores_invalid_dates() {
        assert_eq!(
            stored_last_success(Some(serde_json::json!("2026-10-06T00:00:00Z"))),
            Some(1791244800)
        );
        assert_eq!(stored_last_success(Some(serde_json::json!(123))), Some(123));
        assert_eq!(
            stored_last_success(Some(serde_json::json!("invalid"))),
            None
        );
    }
    #[test]
    fn rescans_new_and_replaced_collectors() {
        let root = std::env::temp_dir().join(format!("wowthing-discovery-{}", std::process::id()));
        let account = root.join("WTF/Account/TEST/SavedVariables");
        std::fs::create_dir_all(&account).unwrap();
        assert!(discover(&root).unwrap().is_empty());
        let collector = account.join("WoWthing_Collector.lua");
        std::fs::write(&collector, "first").unwrap();
        assert_eq!(discover(&root).unwrap(), vec![collector.clone()]);
        let replacement = account.join("replacement");
        std::fs::write(&replacement, "replacement contents").unwrap();
        std::fs::rename(&replacement, &collector).unwrap();
        assert_ne!(
            fingerprints(&discover(&root).unwrap()).unwrap()[&collector],
            fingerprints(&[])
                .unwrap()
                .get(&collector)
                .copied()
                .unwrap_or_default()
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
