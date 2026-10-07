use std::{
    collections::BTreeMap,
    path::PathBuf,
    time::{Duration, Instant},
};

/// One pending entry per file. Taking work only removes that entry: later changes
/// enqueue another upload, including changes observed after an in-flight request.
#[derive(Default)]
pub struct SyncQueue {
    pending: BTreeMap<PathBuf, Instant>,
}
impl SyncQueue {
    pub fn changed(&mut self, file: PathBuf, now: Instant) {
        self.pending.insert(file, now + Duration::from_secs(1));
    }
    pub fn manual(&mut self, files: impl IntoIterator<Item = PathBuf>, now: Instant) {
        for file in files {
            self.pending.insert(file, now);
        }
    }
    pub fn next_due(&self) -> Option<Instant> {
        self.pending.values().copied().min()
    }
    pub fn take_ready(&mut self, now: Instant) -> Option<PathBuf> {
        let file = self
            .pending
            .iter()
            .find(|(_, due)| **due <= now)
            .map(|(file, _)| file.clone())?;
        self.pending.remove(&file);
        Some(file)
    }
    pub fn retain(&mut self, files: &[PathBuf]) {
        self.pending.retain(|file, _| files.contains(file));
    }
    pub fn len(&self) -> usize {
        self.pending.len()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deadlines_follow_debounce_and_ready_work_never_requires_a_sleep() {
        let now = Instant::now();
        let mut queue = SyncQueue::default();
        assert_eq!(queue.next_due(), None);
        queue.changed(PathBuf::from("a"), now);
        assert_eq!(queue.next_due(), Some(now + Duration::from_secs(1)));
        queue.manual([PathBuf::from("b"), PathBuf::from("c")], now);
        assert_eq!(queue.next_due(), Some(now));
        assert_eq!(queue.take_ready(now), Some(PathBuf::from("b")));
        assert_eq!(queue.next_due(), Some(now));
        assert_eq!(queue.take_ready(now), Some(PathBuf::from("c")));
        assert_eq!(queue.next_due(), Some(now + Duration::from_secs(1)));
    }
    #[test]
    fn coalesces_and_waits_for_settled_writes() {
        let mut queue = SyncQueue::default();
        let now = Instant::now();
        let file = PathBuf::from("a");
        queue.changed(file.clone(), now);
        queue.changed(file.clone(), now + Duration::from_millis(900));
        assert_eq!(queue.len(), 1);
        assert!(queue.take_ready(now + Duration::from_secs(1)).is_none());
        assert_eq!(queue.take_ready(now + Duration::from_secs(2)), Some(file));
    }
    #[test]
    fn a_pending_change_survives_discovery_failure_and_recovers() {
        let now = Instant::now();
        let file = PathBuf::from("collector.lua");
        let mut queue = SyncQueue::default();
        queue.changed(file.clone(), now);
        // A failed scan supplies no replacement file list. The worker must not
        // prune pending work until it has a successful discovery result.
        let failed_scan: Result<Vec<PathBuf>, ()> = Err(());
        if let Ok(files) = failed_scan {
            queue.retain(&files);
        }
        queue.retain(std::slice::from_ref(&file)); // recovery, same fingerprint
        assert_eq!(queue.take_ready(now + Duration::from_secs(2)), Some(file));
    }
    #[test]
    fn manual_work_coalesces_and_changes_during_upload_are_retained() {
        let mut queue = SyncQueue::default();
        let now = Instant::now();
        let file = PathBuf::from("a");
        queue.manual([file.clone(), file.clone()], now);
        assert_eq!(queue.take_ready(now), Some(file.clone())); // in flight
        queue.changed(file.clone(), now);
        queue.manual([PathBuf::from("b")], now);
        assert_eq!(queue.take_ready(now), Some(PathBuf::from("b")));
        assert_eq!(queue.take_ready(now + Duration::from_secs(1)), Some(file));
    }
}
