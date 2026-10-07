//! These tests start SyncService itself, with real capability reads, HTTP requests,
//! queue/retry orchestration and atomic Preferences. No Tauri window or OS secrets.
use super::*;
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
};

struct Server {
    endpoint: String,
    requests: Arc<Mutex<Vec<serde_json::Value>>>,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Server {
    fn new(responses: Vec<(u16, Duration)>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/upload/", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let output = requests.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let responses = Arc::new(responses);
        let thread = thread::spawn(move || {
            let mut handlers = Vec::new();
            while !stopping.load(Ordering::Acquire) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let responses = responses.clone();
                        let output = output.clone();
                        let stopping = stopping.clone();
                        handlers.push(thread::spawn(move || {
                            serve(stream, responses, output, stopping)
                        }));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(5))
                    }
                    Err(error) => panic!("mock accept failed: {error}"),
                }
            }
            for handler in handlers {
                handler.join().unwrap();
            }
        });
        Self {
            endpoint,
            requests,
            stop,
            thread: Some(thread),
        }
    }
    fn bodies(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|v| v["luaFile"].as_str().unwrap().to_string())
            .collect()
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        self.thread.take().unwrap().join().unwrap();
    }
}
fn serve(
    mut stream: TcpStream,
    responses: Arc<Vec<(u16, Duration)>>,
    requests: Arc<Mutex<Vec<serde_json::Value>>>,
    stop: Arc<AtomicBool>,
) {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut bytes = Vec::new();
    let mut buffer = [0; 4096];
    let response = loop {
        let count = match stream.read(&mut buffer) {
            Ok(0) | Err(_) => return, // Cancellation may abandon a connected request.
            Ok(count) => count,
        };
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(end) = bytes.windows(4).position(|v| v == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..end]);
            let len: usize = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .map(str::to_owned)
                })
                .unwrap()
                .parse()
                .unwrap();
            if bytes.len() >= end + 4 + len {
                let body: serde_json::Value =
                    serde_json::from_slice(&bytes[end + 4..end + 4 + len]).unwrap();
                assert_eq!(body["apiKey"], "synthetic-worker-key");
                let mut requests = requests.lock().unwrap();
                let response = responses
                    .get(requests.len())
                    .copied()
                    .unwrap_or((200, Duration::ZERO));
                requests.push(body);
                break response;
            }
        }
    };
    let start = Instant::now();
    while start.elapsed() < response.1 && !stop.load(Ordering::Acquire) {
        thread::sleep(Duration::from_millis(5));
    }
    let _ = write!(
        stream,
        "HTTP/1.1 {} Fixture\r\nContent-Length: 0\r\nConnection: close\r\nRetry-After: 0\r\n\r\n",
        response.0
    );
}
#[derive(Clone)]
struct Io {
    store: Arc<crate::preferences::Preferences>,
    endpoint: String,
    timeout: Duration,
}
impl WorkerIo for Io {
    fn preferences(&self) -> Result<Arc<crate::preferences::Preferences>, String> {
        Ok(self.store.clone())
    }
    fn key(&self) -> Result<String, String> {
        Ok("synthetic-worker-key".into())
    }
    fn reload(&self) {}
    fn emit(&self, _: &SyncStatus) {}
    fn effects(&self, successful: bool, now: u64) -> Result<(), String> {
        if successful {
            self.store
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
            .timeout(self.timeout)
            .build()
            .map_err(|e| e.to_string())
    }
}
fn file(root: &Path, account: &str, body: &str) -> PathBuf {
    let path = root.join(format!(
        "WTF/Account/{account}/SavedVariables/WoWthing_Collector.lua"
    ));
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, body).unwrap();
    path
}
fn io(temp: &tempfile::TempDir, server: &Server) -> Io {
    Io {
        store: Arc::new(
            crate::preferences::Preferences::load(temp.path().join("settings.json")).unwrap(),
        ),
        endpoint: server.endpoint.clone(),
        timeout: Duration::from_secs(3),
    }
}
fn wait(label: &str, condition: impl Fn() -> bool) {
    let start = Instant::now();
    while !condition() {
        assert!(
            start.elapsed() < Duration::from_secs(15),
            "timed out: {label}"
        );
        thread::sleep(Duration::from_millis(10));
    }
}
fn configure(service: &SyncService, root: &Path) {
    service
        .configure(Some(crate::collector_fs::ApprovedRoot::open(root).unwrap()))
        .unwrap();
}

#[test]
fn real_worker_discovers_replaces_coalesces_validates_and_persists_across_restart() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("WoW Unicode 雪 with spaces");
    let collector = file(&root, "GOOD", "initial");
    file(&root, "EMPTY", "");
    let oversized = file(&root, "OVERSIZED", "large");
    std::fs::File::create(oversized)
        .unwrap()
        .set_len(crate::collector_fs::MAX_COLLECTOR_BYTES + 1)
        .unwrap();
    let server = Server::new(vec![]);
    let io = io(&temp, &server);
    io.store
        .commit("program-folder", Some(serde_json::json!(root)))
        .unwrap();
    let service = SyncService::start_with_io(io.clone());
    wait("initial upload", || {
        service.snapshot().last_success.is_some()
    });
    assert_eq!(server.bodies(), ["initial"]);
    assert_eq!(service.snapshot().failures.len(), 2);
    let replacement = collector.with_extension("replacement");
    std::fs::write(&replacement, "replacement").unwrap();
    // Windows does not replace an existing destination via rename.
    std::fs::remove_file(&collector).unwrap();
    std::fs::rename(replacement, &collector).unwrap();
    wait("replacement upload", || {
        server.bodies().contains(&"replacement".into())
    });
    for index in 0..5 {
        std::fs::write(&collector, format!("rapid {index}")).unwrap();
        thread::sleep(Duration::from_millis(50));
    }
    wait("settled writes", || {
        server.bodies().contains(&"rapid 4".into())
    });
    assert_eq!(server.bodies().len(), 3, "rapid writes must coalesce");
    file(&root, "NEW", "new account");
    wait("new account", || {
        server.bodies().contains(&"new account".into())
    });
    service.shutdown();
    let timestamp = io.store.get("last-success").unwrap();
    let restarted = Io {
        store: Arc::new(
            crate::preferences::Preferences::load(temp.path().join("settings.json")).unwrap(),
        ),
        ..io
    };
    let service = SyncService::start_with_io(restarted);
    wait("rehydrated timestamp", || {
        service.snapshot().last_success == timestamp.as_u64()
    });
    service.shutdown();
}
#[test]
fn real_worker_keeps_writes_during_upload_and_cancels_folder_changes_and_shutdown() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("first");
    let collector = file(&root, "A", "in flight");
    let server = Server::new(vec![
        (200, Duration::from_millis(500)),
        (200, Duration::ZERO),
        (200, Duration::from_secs(10)),
    ]);
    let service = SyncService::start_with_io(io(&temp, &server));
    configure(&service, &root);
    service.manual().unwrap();
    wait("request in flight", || server.bodies().len() == 1);
    std::fs::write(&collector, "written during upload").unwrap();
    wait("later write uploaded", || server.bodies().len() == 2);
    assert_eq!(server.bodies(), ["in flight", "written during upload"]);
    let prior = service.snapshot().last_success;
    std::fs::write(&collector, "stale folder request").unwrap();
    service.manual().unwrap();
    wait("stalled request", || server.bodies().len() == 3);
    let other = temp.path().join("second");
    file(&other, "B", "new folder");
    let start = Instant::now();
    configure(&service, &other);
    service.manual().unwrap();
    wait("new folder takes over", || {
        server.bodies().len() == 4 && !service.snapshot().is_processing
    });
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(service
        .snapshot()
        .files
        .iter()
        .all(|path| path.contains("second")));
    assert!(service.snapshot().failures.is_empty());
    assert!(service.snapshot().last_success >= prior);
    service.shutdown();

    let blocked = Server::new(vec![(200, Duration::from_secs(10))]);
    let fresh = tempfile::tempdir().unwrap();
    let service = SyncService::start_with_io(io(&fresh, &blocked));
    configure(&service, &root);
    service.manual().unwrap();
    wait("shutdown during upload", || blocked.bodies().len() == 1);
    let start = Instant::now();
    service.shutdown();
    assert!(start.elapsed() < Duration::from_secs(2));
    assert!(service.snapshot().last_success.is_none());
}
#[test]
fn real_worker_retries_http_failures_and_reports_bounded_timeouts() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("root");
    file(&root, "A", "retry payload");
    let server = Server::new(vec![
        (503, Duration::ZERO),
        (429, Duration::ZERO),
        (200, Duration::ZERO),
    ]);
    let service = SyncService::start_with_io(io(&temp, &server));
    configure(&service, &root);
    service.manual().unwrap();
    wait("real HTTP retries", || {
        service.snapshot().last_success.is_some()
    });
    assert_eq!(
        server.bodies(),
        ["retry payload", "retry payload", "retry payload"]
    );
    service.shutdown();
    let server = Server::new(vec![(200, Duration::from_secs(10)); 3]);
    let fresh = tempfile::tempdir().unwrap();
    let io = Io {
        timeout: Duration::from_millis(100),
        ..io(&fresh, &server)
    };
    let service = SyncService::start_with_io(io);
    configure(&service, &root);
    service.manual().unwrap();
    wait("bounded timeout failure", || {
        !service.snapshot().failures.is_empty()
    });
    assert_eq!(server.bodies().len(), 3);
    assert_eq!(service.snapshot().last_success, None);
    service.shutdown();
}
#[test]
#[ignore = "nightly endurance tier"]
fn real_worker_long_run() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("root");
    let collector = file(&root, "A", "start");
    let server = Server::new(vec![]);
    let service = SyncService::start_with_io(io(&temp, &server));
    configure(&service, &root);
    for index in 0..30 {
        let body = format!("endurance {index}");
        std::fs::write(&collector, &body).unwrap();
        wait("endurance upload", || server.bodies().contains(&body));
    }
    service.shutdown();
    assert_eq!(server.bodies().len(), 30);
}
