//! App-lifetime collector discovery. The worker belongs to the native app, never a page.
use serde::Serialize;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub folder: Option<String>,
    pub files: Vec<String>,
    pub is_processing: bool,
    pub last_success: Option<u64>,
    pub error: Option<String>,
}
enum Request {
    Configure(Option<String>),
    Manual,
    Shutdown,
}
pub struct SyncService {
    sender: mpsc::Sender<Request>,
    status: Arc<Mutex<SyncStatus>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    stopping: Arc<AtomicBool>,
}
impl SyncService {
    pub fn start(app: tauri::AppHandle) -> Self {
        let (sender, receiver) = mpsc::channel();
        let status = Arc::new(Mutex::new(SyncStatus::default()));
        let worker_status = status.clone();
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stopping = stopping.clone();
        let worker = thread::spawn(move || run(app, receiver, worker_status, worker_stopping));
        Self {
            stopping,
            sender,
            status,
            worker: Mutex::new(Some(worker)),
        }
    }
    pub fn configure(&self, folder: Option<String>) -> Result<(), String> {
        self.sender
            .send(Request::Configure(folder))
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
    *status.lock().unwrap_or_else(|e| e.into_inner()) = value.clone();
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
fn fingerprints(files: &[PathBuf]) -> Result<BTreeMap<PathBuf, (SystemTime, u64)>, String> {
    files
        .iter()
        .map(|p| {
            let m = std::fs::metadata(p).map_err(|e| e.to_string())?;
            Ok((
                p.clone(),
                (m.modified().map_err(|e| e.to_string())?, m.len()),
            ))
        })
        .collect()
}
fn run(
    app: tauri::AppHandle,
    receiver: mpsc::Receiver<Request>,
    shared: Arc<Mutex<SyncStatus>>,
    stopping: Arc<AtomicBool>,
) {
    let mut state = SyncStatus::default();
    match app.store(".settings.dat") {
        Ok(store) => {
            state.folder = store
                .get("program-folder")
                .and_then(|v| v.as_str().map(String::from))
        }
        Err(e) => state.error = Some(e.to_string()),
    }
    let mut previous = BTreeMap::new();
    publish(&app, &shared, &state);
    while !stopping.load(Ordering::Acquire) {
        let manual = match receiver.recv_timeout(Duration::from_millis(500)) {
            Ok(Request::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Request::Configure(folder)) => {
                state.folder = folder;
                previous.clear();
                state.files.clear();
                state.error = None;
                publish(&app, &shared, &state);
                false
            }
            Ok(Request::Manual) => true,
            Err(mpsc::RecvTimeoutError::Timeout) => false,
        };
        let Some(folder) = &state.folder else {
            continue;
        };
        let result = discover(Path::new(folder))
            .and_then(|files| fingerprints(&files).map(|prints| (files, prints)));
        let (files, prints) = match result {
            Ok(result) => result,
            Err(e) => {
                state.error = Some(e);
                publish(&app, &shared, &state);
                continue;
            }
        };
        state.files = files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let changed: Vec<_> = files
            .into_iter()
            .filter(|p| manual || previous.get(p) != prints.get(p))
            .collect();
        previous = prints;
        publish(&app, &shared, &state);
        if changed.is_empty() {
            continue;
        }
        state.is_processing = true;
        state.error = None;
        publish(&app, &shared, &state);
        for file in changed {
            if stopping.load(Ordering::Acquire) {
                break;
            }
            let file_path = file.to_string_lossy();
            let outcome = tauri::async_runtime::block_on(async {
                tokio::select! {
                    result = crate::commands::submit_addon_data::submit_addon_data(app.clone(), &file_path) => Some(result),
                    () = async { while !stopping.load(Ordering::Acquire) { tokio::time::sleep(Duration::from_millis(50)).await; } } => None,
                }
            });
            let Some(outcome) = outcome else {
                break;
            };
            match outcome {
                Ok(_) => {
                    state.last_success = Some(
                        SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs(),
                    )
                }
                Err(e) => state.error = Some(e),
            }
        }
        state.is_processing = false;
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
        assert_eq!(
            fingerprints(&discover(&root).unwrap()).unwrap()[&collector].1,
            20
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
