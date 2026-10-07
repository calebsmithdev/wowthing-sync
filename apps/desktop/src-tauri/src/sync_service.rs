//! App-lifetime collector discovery. The worker belongs to the native app, never a page.
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(not(feature = "integration-test"))]
use tauri::{Emitter, Manager};

#[derive(Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub folder: Option<String>,
    pub has_api_key: bool,
    pub files: Vec<String>,
    pub is_processing: bool,
    pub last_success: Option<u64>,
    pub error: Option<String>,
    pub pending: usize,
    pub failures: Vec<FileFailure>,
    pub warning: Option<String>,
    /// Last successful upload time per collector file, persisted as `account-uploads`.
    pub uploads: BTreeMap<String, u64>,
}
#[derive(Clone, PartialEq, Serialize)]
pub struct FileFailure {
    pub file: String,
    pub message: String,
}
/// Upload results since the queue was last empty; notified once as a whole.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct BatchSummary {
    pub uploaded: usize,
    pub failed: usize,
}
impl BatchSummary {
    fn record(&mut self, successful: bool) {
        if successful {
            self.uploaded += 1;
        } else {
            self.failed += 1;
        }
    }
    fn is_empty(&self) -> bool {
        self.uploaded == 0 && self.failed == 0
    }
    #[cfg_attr(feature = "integration-test", allow(dead_code))]
    fn message(&self) -> String {
        let accounts = |n: usize| {
            if n == 1 {
                "1 account".to_string()
            } else {
                format!("{n} accounts")
            }
        };
        match (self.uploaded, self.failed) {
            (1, 0) => "Collector data uploaded.".into(),
            (uploaded, 0) => format!("Collector data uploaded for {}.", accounts(uploaded)),
            (0, failed) => format!(
                "Upload failed for {}. Open WoWthing Sync for details.",
                accounts(failed)
            ),
            (uploaded, failed) => format!(
                "Uploaded {uploaded} of {}. {failed} failed; open WoWthing Sync for details.",
                accounts(uploaded + failed)
            ),
        }
    }
}
impl SyncStatus {
    fn finish_upload(
        &mut self,
        file: &Path,
        outcome: Result<(), String>,
        now: u64,
        effects: impl FnOnce(bool, &SyncStatus) -> Result<(), String>,
    ) {
        let successful = outcome.is_ok();
        self.record_upload(file, outcome, now);
        self.warning = effects(successful, self).err();
    }
    fn record_upload(&mut self, file: &Path, outcome: Result<(), String>, now: u64) {
        self.is_processing = false;
        let file = file.to_string_lossy().into_owned();
        self.failures.retain(|failure| failure.file != file);
        match outcome {
            Ok(()) => {
                self.last_success = Some(now);
                self.uploads.insert(file, now);
            }
            Err(message) => self.failures.push(FileFailure { file, message }),
        }
    }
}
#[cfg(test)]
pub(crate) fn validate_folder(folder: &Path) -> Result<Vec<PathBuf>, String> {
    let files = crate::collector_fs::ApprovedRoot::open(folder)?.discover()?;
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
#[cfg(not(feature = "integration-test"))]
fn batch_notification(app: &tauri::AppHandle, summary: BatchSummary) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    let enabled = crate::preferences::store(app)
        .map_err(|_| "Could not access sync preferences".to_string())?
        .get("notifications-enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        return Ok(());
    }
    match app.notification().permission_state() {
        Ok(tauri_plugin_notification::PermissionState::Granted) => app
            .notification()
            .builder()
            .title("WoWthing Sync")
            .body(summary.message())
            .show()
            .map_err(|_| {
                "Desktop notification failed. Sync results remain available in the app.".into()
            }),
        Ok(_) => Ok(()), // Background work never prompts for permission.
        Err(_) => Err("Could not check desktop notification permission.".into()),
    }
}
/// OS and transport boundary only. Discovery, validation, queueing, retries,
/// cancellation and persistence remain in the production worker.
pub(crate) trait WorkerIo: Send + Sync + 'static {
    fn preferences(&self) -> Result<Arc<crate::preferences::Preferences>, String>;
    fn key(&self) -> Result<String, String>;
    fn reload(&self);
    fn emit(&self, status: &SyncStatus);
    /// Called once when the queue drains after one or more uploads finished.
    fn notify(&self, _summary: BatchSummary) -> Result<(), String> {
        Ok(())
    }
    fn client(&self) -> Result<reqwest::Client, String> {
        crate::commands::submit_addon_data::http_client()
    }
    fn endpoint(&self) -> &str {
        crate::commands::submit_addon_data::WOWTHING_UPLOAD_ENDPOINT
    }
}
#[cfg(not(feature = "integration-test"))]
struct AppIo(tauri::AppHandle);
#[cfg(not(feature = "integration-test"))]
impl WorkerIo for AppIo {
    fn preferences(&self) -> Result<Arc<crate::preferences::Preferences>, String> {
        crate::preferences::store(&self.0)
    }
    fn key(&self) -> Result<String, String> {
        self.0.state::<crate::credentials::SecretManager>().key()
    }
    fn reload(&self) {
        self.0
            .state::<crate::credentials::SecretManager>()
            .reload(&self.0);
    }
    fn emit(&self, status: &SyncStatus) {
        let _ = self.0.emit("sync-status", status);
    }
    fn notify(&self, summary: BatchSummary) -> Result<(), String> {
        batch_notification(&self.0, summary)
    }
}
const FALLBACK_INTERVAL: Duration = Duration::from_secs(1);
const RECONCILE_INTERVAL: Duration = Duration::from_secs(30);
const VERIFY_INTERVAL: Duration = Duration::from_secs(5 * 60);

/// Native events only wake capability-based scans; they never authorize a path.
/// A single outstanding wake bounds memory during bursts or stalled uploads.
struct CollectorWatcher {
    _watcher: notify::RecommendedWatcher,
    pending: Arc<AtomicBool>,
    healthy: Arc<AtomicBool>,
}
impl CollectorWatcher {
    fn start(
        root: Option<&crate::collector_fs::ApprovedRoot>,
        sender: &mpsc::Sender<Request>,
        epoch: u64,
    ) -> Option<Self> {
        use notify::Watcher;
        let accounts = root?.path().join("WTF/Account");
        let watched = accounts.clone();
        let pending = Arc::new(AtomicBool::new(false));
        let healthy = Arc::new(AtomicBool::new(true));
        let queued = pending.clone();
        let health = healthy.clone();
        let sender = sender.clone();
        let mut watcher = notify::RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                let relevant = match result {
                    Ok(event) => relevant_event(&event, &watched),
                    Err(_) => {
                        health.store(false, Ordering::Release);
                        true
                    }
                };
                if relevant && !queued.swap(true, Ordering::AcqRel) {
                    let _ = sender.send(Request::FilesChanged(epoch));
                }
            },
            notify::Config::default().with_follow_symlinks(false),
        )
        .ok()?;
        watcher
            .watch(&accounts, notify::RecursiveMode::Recursive)
            .ok()?;
        Some(Self {
            _watcher: watcher,
            pending,
            healthy,
        })
    }
    fn healthy(&self) -> bool {
        self.healthy.load(Ordering::Acquire)
    }
}
fn relevant_event(event: &notify::Event, accounts: &Path) -> bool {
    if matches!(event.kind, notify::EventKind::Access(_)) {
        return false; // Our own reads must not trigger another scan.
    }
    event.need_rescan()
        || event.paths.is_empty()
        || event.paths.iter().any(|path| {
            path.strip_prefix(accounts).is_ok_and(|relative| {
                let depth = relative.components().count();
                depth <= 1
                    || (depth == 2
                        && relative
                            .file_name()
                            .is_some_and(|name| name == "SavedVariables"))
                    || (depth == 3
                        && relative
                            .file_name()
                            .is_some_and(|name| name == "WoWthing_Collector.lua"))
            })
        })
}

enum Request {
    Configure(u64, Option<crate::collector_fs::ApprovedRoot>),
    File(PathBuf),
    Manual,
    Shutdown,
    FilesChanged(u64),
}
pub struct SyncService {
    sender: mpsc::Sender<Request>,
    status: Arc<Mutex<SyncStatus>>,
    worker: Mutex<Option<thread::JoinHandle<()>>>,
    stopping: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
}
impl SyncService {
    #[cfg(not(feature = "integration-test"))]
    pub fn start(app: tauri::AppHandle) -> Self {
        Self::start_with_io(AppIo(app))
    }
    pub(crate) fn start_with_io(io: impl WorkerIo) -> Self {
        let (sender, receiver) = mpsc::channel();
        let status = Arc::new(Mutex::new(SyncStatus::default()));
        let worker_status = status.clone();
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stopping = stopping.clone();
        let generation = Arc::new(AtomicU64::new(0));
        let worker_generation = generation.clone();
        let wake_sender = sender.clone();
        let worker = thread::spawn(move || {
            run(
                io,
                receiver,
                wake_sender,
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
    pub fn configure(&self, root: Option<crate::collector_fs::ApprovedRoot>) -> Result<(), String> {
        if self.stopping.load(Ordering::Acquire) {
            return Err("Sync service stopped".into());
        }
        self.sender
            .send(Request::Configure(
                self.generation.fetch_add(1, Ordering::AcqRel) + 1,
                root,
            ))
            .map_err(|_| "Sync service stopped".into())
    }
    pub fn enqueue_file(&self, file: String) -> Result<(), String> {
        let status = self.snapshot();
        let root = crate::collector_fs::ApprovedRoot::open(Path::new(
            status
                .folder
                .as_deref()
                .ok_or("Choose a WoW folder in Settings")?,
        ))?;
        root.metadata(Path::new(&file))?;
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
fn publish(io: &impl WorkerIo, status: &Arc<Mutex<SyncStatus>>, value: &SyncStatus) {
    let mut current = status.lock().unwrap_or_else(|e| e.into_inner());
    if *current == *value {
        return;
    }
    *current = value.clone();
    drop(current);
    io.emit(value);
}

/// Rescan directories, rather than holding handles to individual files: rename/replace and
/// new account folders are discovered even when no frontend is mounted.
#[cfg(test)]
pub(crate) fn discover(folder: &Path) -> Result<Vec<PathBuf>, String> {
    crate::collector_fs::ApprovedRoot::open(folder)?.discover()
}
#[derive(Clone, PartialEq)]
struct FileStamp {
    len: u64,
    modified: Option<SystemTime>,
    created: Option<SystemTime>,
}
type FingerprintCache = BTreeMap<PathBuf, (FileStamp, u64, Instant)>;
fn fingerprints(
    root: &crate::collector_fs::ApprovedRoot,
    files: &[PathBuf],
    cache: &mut FingerprintCache,
    verify_after: Duration,
) -> (BTreeMap<PathBuf, u64>, Vec<(PathBuf, String)>) {
    use std::hash::{Hash, Hasher};
    let mut fingerprints = BTreeMap::new();
    let mut failures = Vec::new();
    for file in files {
        let result = (|| -> Result<u64, String> {
            let metadata = root.metadata(file)?;
            let stamp = FileStamp {
                len: metadata.len(),
                modified: metadata.modified().ok().map(|time| time.into_std()),
                created: metadata.created().ok().map(|time| time.into_std()),
            };
            let cached = cache.get(file).filter(|(previous, _, verified)| {
                previous == &stamp && verified.elapsed() < verify_after
            });
            let hash = if let Some((_, hash, _)) = cached {
                *hash
            } else {
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                root.read(file)?.hash(&mut hasher);
                let hash = hasher.finish();
                cache.insert(file.clone(), (stamp, hash, Instant::now()));
                hash
            };
            Ok(hash)
        })();
        match result {
            Ok(hash) => {
                fingerprints.insert(file.clone(), hash);
            }
            Err(error) => {
                cache.remove(file);
                failures.push((file.clone(), error));
            }
        }
    }
    cache.retain(|file, _| fingerprints.contains_key(file));
    (fingerprints, failures)
}
async fn until_cancelled<T>(
    operation: impl std::future::Future<Output = T>,
    stopping: &AtomicBool,
    generation: &AtomicU64,
    expected: u64,
) -> Option<T> {
    // Bias cancellation when configuration changed before a request completed.
    tokio::select! {
        biased;
        () = async { while !stopping.load(Ordering::Acquire) && generation.load(Ordering::Acquire) == expected { tokio::time::sleep(Duration::from_millis(50)).await; } } => None,
        result = operation => Some(result),
    }
}
fn run(
    io: impl WorkerIo,
    receiver: mpsc::Receiver<Request>,
    wake_sender: mpsc::Sender<Request>,
    shared: Arc<Mutex<SyncStatus>>,
    stopping: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
) {
    let mut state = SyncStatus::default();
    io.reload();
    state.has_api_key = io.key().is_ok();
    state.error = io.key().err();
    match io.preferences() {
        Ok(store) => {
            state.folder = store
                .get("program-folder")
                .and_then(|v| v.as_str().map(String::from));
            state.last_success = stored_last_success(
                store
                    .get("last-success")
                    .or_else(|| store.get("last-updated")),
            );
            state.uploads = store
                .get("account-uploads")
                .and_then(|value| serde_json::from_value(value).ok())
                .unwrap_or_default();
        }
        Err(e) => state.error = Some(e.to_string()),
    }
    let client = match io.client() {
        Ok(client) => client,
        Err(error) => {
            state.error = Some(error);
            publish(&io, &shared, &state);
            return;
        }
    };
    let mut previous = BTreeMap::new();
    let mut scan_failures = BTreeSet::new();
    let mut cache = FingerprintCache::new();
    let mut approved = state
        .folder
        .as_ref()
        .and_then(|folder| crate::collector_fs::ApprovedRoot::open(Path::new(folder)).ok());
    if let Some(root) = &approved {
        state.folder = Some(root.path().to_string_lossy().into_owned());
    }
    let mut queue = crate::sync_queue::SyncQueue::default();
    let mut batch = BatchSummary::default();
    let mut active_generation = 0;
    let mut watcher = CollectorWatcher::start(approved.as_ref(), &wake_sender, active_generation);
    let mut next_scan = Instant::now();
    publish(&io, &shared, &state);
    while !stopping.load(Ordering::Acquire) {
        let deadline = if state.error.is_none() {
            queue.next_due().map_or(next_scan, |due| due.min(next_scan))
        } else {
            next_scan
        };
        let request =
            match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(request) => Some(request),
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                Err(mpsc::RecvTimeoutError::Timeout) => None,
            };
        let mut manual = false;
        for request in request.into_iter().chain(receiver.try_iter()) {
            match request {
                Request::Shutdown => return,
                Request::FilesChanged(epoch) => {
                    if epoch == active_generation {
                        if let Some(watcher) = &watcher {
                            watcher.pending.store(false, Ordering::Release);
                        }
                        // Events are hints only. All discovery/reads still use ApprovedRoot.
                        cache.clear();
                    }
                }
                Request::Configure(epoch, root) => {
                    active_generation = epoch;
                    state.folder = root
                        .as_ref()
                        .map(|root| root.path().to_string_lossy().into_owned());
                    approved = root;
                    watcher = CollectorWatcher::start(approved.as_ref(), &wake_sender, epoch);
                    previous.clear();
                    cache.clear();
                    queue = Default::default();
                    batch = BatchSummary::default();
                    state.files.clear();
                    state.is_processing = false;
                    state.pending = 0;
                    state.error = None;
                    state.failures.clear();
                    scan_failures.clear();
                    state.warning = None;
                    manual = false;
                    publish(&io, &shared, &state);
                }
                Request::Manual => {
                    if io.key().is_err() {
                        io.reload();
                    }
                    manual = true;
                }
                Request::File(file) => queue.manual([file], Instant::now()),
            }
        }
        let watching = watcher.as_ref().is_some_and(CollectorWatcher::healthy);
        next_scan = Instant::now()
            + if watching {
                RECONCILE_INTERVAL
            } else {
                FALLBACK_INTERVAL
            };
        state.has_api_key = io.key().is_ok();
        if let Err(error) = io.preferences() {
            state.error = Some(error);
            publish(&io, &shared, &state);
            continue;
        }
        let Some(folder) = &state.folder else {
            state.error = Some("Choose your World of Warcraft _retail_ folder in Settings.".into());
            publish(&io, &shared, &state);
            continue;
        };
        let api_key = match io.key() {
            Ok(key) => key,
            Err(error) => {
                state.has_api_key = false;
                state.error = Some(error);
                publish(&io, &shared, &state);
                continue;
            }
        };
        state.has_api_key = true;
        if approved.is_none() {
            approved = crate::collector_fs::ApprovedRoot::open(Path::new(folder)).ok();
            watcher = CollectorWatcher::start(approved.as_ref(), &wake_sender, active_generation);
        }
        let Some(root) = &approved else {
            state.error = Some("WoW folder unavailable. Choose it again in Settings.".into());
            publish(&io, &shared, &state);
            continue;
        };
        let result = root.scan().map(|(files, mut failures)| {
            let (prints, read_failures) = fingerprints(
                root,
                &files,
                &mut cache,
                if watching {
                    VERIFY_INTERVAL
                } else {
                    RECONCILE_INTERVAL
                },
            );
            failures.extend(read_failures);
            (prints, failures)
        });
        let (prints, failures) = match result {
            Ok(result) => result,
            Err(error) => {
                state.error = Some(error);
                state.files.clear();
                state.pending = queue.len();
                publish(&io, &shared, &state);
                continue;
            }
        };
        // Clear only previous scan errors. Upload failures survive a healthy scan.
        state
            .failures
            .retain(|failure| !scan_failures.contains(&failure.file));
        scan_failures.clear();
        for (file, message) in failures {
            let file = file.to_string_lossy().into_owned();
            state.failures.retain(|failure| failure.file != file);
            scan_failures.insert(file.clone());
            state.failures.push(FileFailure { file, message });
        }
        let files: Vec<_> = prints.keys().cloned().collect();
        queue.retain(&files);
        previous.retain(|file, _| prints.contains_key(file));
        if files.is_empty() {
            state.error = Some("No readable, nonempty WoWthing_Collector.lua files found. Enable the addon and log out of WoW.".into());
            state.files.clear();
            state.pending = queue.len();
            publish(&io, &shared, &state);
            continue;
        }
        state.error = None;
        state.files = files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
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
        // Checked after a scan, so writes made during the last upload extend the batch.
        if queue.len() == 0 && !batch.is_empty() {
            if let Err(warning) = io.notify(std::mem::take(&mut batch)) {
                state.warning = Some(warning);
            }
        }
        publish(&io, &shared, &state);
        let Some(file) = queue.take_ready(now) else {
            continue;
        };
        state.is_processing = true;
        state.pending = queue.len();
        state.error = None;
        publish(&io, &shared, &state);
        let outcome = tauri::async_runtime::block_on(until_cancelled(
            crate::commands::submit_addon_data::upload_file(
                &api_key,
                io.endpoint(),
                &client,
                root,
                &file,
            ),
            &stopping,
            &generation,
            active_generation,
        ));
        state.is_processing = false;
        if generation.load(Ordering::Acquire) != active_generation {
            continue;
        }
        if let Some(outcome) = outcome {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let successful = outcome.is_ok();
            batch.record(successful);
            state.finish_upload(&file, outcome.map(|_| ()), now, |successful, status| {
                if !successful {
                    return Ok(());
                }
                io.preferences()
                    .and_then(|store| {
                        store.commit_many([
                            ("last-success", Some(serde_json::json!(now))),
                            ("account-uploads", Some(serde_json::json!(status.uploads))),
                        ])
                    })
                    .map_err(|_| "Upload succeeded, but its timestamp could not be saved.".into())
            });
        }
        publish(&io, &shared, &state);
        // Reconcile writes made during the upload and drain ready work without a fixed sleep.
        next_scan = Instant::now();
    }
}
#[tauri::command]
pub fn get_sync_status(service: tauri::State<'_, SyncService>) -> SyncStatus {
    service.snapshot()
}
#[tauri::command]
pub fn sync_now(service: tauri::State<'_, SyncService>) -> Result<(), String> {
    service.manual()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn watcher_filters_reads_and_unrelated_addons_but_tracks_replacements() {
        use notify::{
            event::{AccessKind, ModifyKind, RenameMode},
            Event, EventKind,
        };
        let accounts = Path::new("/fixture/WTF/Account");
        let collector = accounts.join("MAIN/SavedVariables/WoWthing_Collector.lua");
        assert!(!relevant_event(
            &Event::new(EventKind::Access(AccessKind::Read)).add_path(collector.clone()),
            accounts
        ));
        assert!(!relevant_event(
            &Event::new(EventKind::Modify(ModifyKind::Any))
                .add_path(accounts.join("MAIN/SavedVariables/Other.lua")),
            accounts
        ));
        assert!(!relevant_event(
            &Event::new(EventKind::Any).add_path(PathBuf::from("/outside/file")),
            accounts
        ));
        for path in [
            collector,
            accounts.to_owned(),
            accounts.join("NEW"),
            accounts.join("MAIN/SavedVariables"),
        ] {
            assert!(relevant_event(
                &Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Any))).add_path(path),
                accounts
            ));
        }
        assert!(relevant_event(&Event::new(EventKind::Any), accounts));
    }

    #[test]
    fn periodic_verification_rehashes_even_when_metadata_matches() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp
            .path()
            .join("WTF/Account/MAIN/SavedVariables/WoWthing_Collector.lua");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "fixture").unwrap();
        let root = crate::collector_fs::ApprovedRoot::open(temp.path()).unwrap();
        let files = root.discover().unwrap();
        let mut cache = FingerprintCache::new();
        let (original, _) = fingerprints(&root, &files, &mut cache, VERIFY_INTERVAL);
        let cached = cache.get_mut(&files[0]).unwrap();
        cached.1 = original[&files[0]].wrapping_add(1);
        let (fresh, _) = fingerprints(&root, &files, &mut cache, Duration::ZERO);
        assert_eq!(fresh, original);
        assert!(CollectorWatcher::start(None, &mpsc::channel().0, 0).is_none());
    }
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
        assert_eq!(
            status.uploads,
            BTreeMap::from([("failed.lua".into(), 3), ("successful.lua".into(), 2)])
        );
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
    fn batch_notifications_summarize_every_upload_in_the_batch() {
        let summary = |uploaded, failed| BatchSummary { uploaded, failed }.message();
        assert_eq!(summary(1, 0), "Collector data uploaded.");
        assert_eq!(summary(3, 0), "Collector data uploaded for 3 accounts.");
        assert_eq!(
            summary(0, 1),
            "Upload failed for 1 account. Open WoWthing Sync for details."
        );
        assert_eq!(
            summary(2, 1),
            "Uploaded 2 of 3 accounts. 1 failed; open WoWthing Sync for details."
        );
        let mut batch = BatchSummary::default();
        assert!(batch.is_empty());
        batch.record(true);
        batch.record(false);
        assert_eq!(
            batch,
            BatchSummary {
                uploaded: 1,
                failed: 1
            }
        );
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
    #[tokio::test]
    async fn configuration_changes_and_shutdown_cancel_stalled_uploads() {
        for stop in [false, true] {
            let stopping = AtomicBool::new(false);
            let generation = AtomicU64::new(1);
            let pending = until_cancelled(std::future::pending::<()>(), &stopping, &generation, 1);
            let change = async {
                tokio::time::sleep(Duration::from_millis(5)).await;
                if stop {
                    stopping.store(true, Ordering::Release);
                } else {
                    generation.store(2, Ordering::Release);
                }
            };
            let (outcome, ()) = tokio::time::timeout(Duration::from_millis(250), async {
                tokio::join!(pending, change)
            })
            .await
            .expect("Cancellation must bound shutdown/configuration latency");
            assert_eq!(outcome, None);
        }
        let stale = until_cancelled(
            std::future::ready("stale result"),
            &AtomicBool::new(false),
            &AtomicU64::new(2),
            1,
        )
        .await;
        assert_eq!(stale, None);
    }
    #[test]
    fn unhealthy_collectors_do_not_block_healthy_account_queue() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let mut candidates = Vec::new();
        for account in ["GOOD", "EMPTY", "OVERSIZED"] {
            let file = root.join(format!(
                "WTF/Account/{account}/SavedVariables/WoWthing_Collector.lua"
            ));
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(
                &file,
                if account == "EMPTY" {
                    ""
                } else {
                    "fixture lua"
                },
            )
            .unwrap();
            if account == "OVERSIZED" {
                std::fs::File::create(&file)
                    .unwrap()
                    .set_len(crate::collector_fs::MAX_COLLECTOR_BYTES + 1)
                    .unwrap();
            }
            candidates.push(file);
        }
        let approved = crate::collector_fs::ApprovedRoot::open(&root).unwrap();
        let (files, scan_errors) = approved.scan().unwrap();
        let (prints, read_errors) =
            fingerprints(&approved, &files, &mut Default::default(), VERIFY_INTERVAL);
        assert_eq!(scan_errors.len(), 1);
        assert_eq!(read_errors.len(), 1);
        assert_eq!(
            prints.keys().cloned().collect::<Vec<_>>(),
            vec![candidates[0].clone()]
        );
        let mut queue = crate::sync_queue::SyncQueue::default();
        let now = Instant::now();
        queue.manual(prints.into_keys(), now);
        assert_eq!(queue.take_ready(now), Some(candidates[0].clone()));
        std::fs::write(&candidates[1], "fixed collector").unwrap();
        assert_eq!(
            fingerprints(
                &approved,
                &approved.scan().unwrap().0,
                &mut Default::default(),
                VERIFY_INTERVAL
            )
            .0
            .len(),
            2
        );
    }
    #[test]
    fn rescans_new_and_replaced_collectors() {
        let root = std::env::temp_dir().join(format!("wowthing-discovery-{}", std::process::id()));
        let account = root.join("WTF/Account/TEST/SavedVariables");
        std::fs::create_dir_all(&account).unwrap();
        let root = root.canonicalize().unwrap();
        let account = root.join("WTF/Account/TEST/SavedVariables");
        assert!(discover(&root).unwrap().is_empty());
        let collector = account.join("WoWthing_Collector.lua");
        std::fs::write(&collector, "first").unwrap();
        assert_eq!(discover(&root).unwrap(), vec![collector.clone()]);
        let replacement = account.join("replacement");
        std::fs::write(&replacement, "replacement contents").unwrap();
        std::fs::rename(&replacement, &collector).unwrap();
        let approved = crate::collector_fs::ApprovedRoot::open(&root).unwrap();
        assert_eq!(approved.read(&collector).unwrap(), b"replacement contents");
        drop(approved); // Release the held directory before deleting the Windows fixture.
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[cfg(test)]
#[path = "worker_integration.rs"]
mod worker_integration;
