//! Typed commands own settings. Writes replace the file atomically; a failed save
//! never commits half-written JSON or changes the hydrated in-memory preferences.
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::Manager;

pub(crate) const MAX_SETTINGS_BYTES: usize = 1024 * 1024;

pub struct Preferences {
    path: PathBuf,
    values: Mutex<BTreeMap<String, serde_json::Value>>,
}
pub struct PreferencesState(pub Result<Arc<Preferences>, String>);
impl Preferences {
    pub fn load(path: PathBuf) -> Result<Self, String> {
        let bytes = match std::fs::File::open(&path) {
            Ok(file) => {
                let mut bytes = Vec::new();
                file.take((MAX_SETTINGS_BYTES + 1) as u64)
                    .read_to_end(&mut bytes)
                    .map_err(|_| {
                        "Could not read settings. Check app-data permissions and restart the app."
                            .to_string()
                    })?;
                Some(bytes)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => {
                return Err(
                    "Could not read settings. Check app-data permissions and restart the app."
                        .into(),
                )
            }
        };
        let values = match bytes {
            Some(bytes) if bytes.len() <= MAX_SETTINGS_BYTES => {
                serde_json::from_slice(&bytes).map_err(|_| {
                    "Settings file is invalid. Repair or restore it and restart the app before saving settings."
                        .to_string()
                })?
            }
            Some(_) => return Err("Settings file exceeds the size limit. Repair it and restart the app.".into()),
            None => BTreeMap::new(),
        };
        Ok(Self {
            path,
            values: Mutex::new(values),
        })
    }
    pub fn get(&self, key: &str) -> Option<serde_json::Value> {
        self.values
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(key)
            .cloned()
    }
    pub fn commit(&self, key: &str, value: Option<serde_json::Value>) -> Result<(), String> {
        self.commit_many([(key, value)])
    }
    /// Persist related values with one durable replacement and one in-memory commit.
    pub fn commit_many<'a>(
        &self,
        changes: impl IntoIterator<Item = (&'a str, Option<serde_json::Value>)>,
    ) -> Result<(), String> {
        let mut values = self.values.lock().unwrap_or_else(|e| e.into_inner());
        let mut updated = values.clone();
        for (key, value) in changes {
            if let Some(value) = value {
                updated.insert(key.into(), value);
            } else {
                updated.remove(key);
            }
        }
        write_atomic(&self.path, &updated)?;
        *values = updated;
        Ok(())
    }
}
fn write_atomic(path: &Path, values: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    let bytes = serde_json::to_vec(values).map_err(|_| "Could not write settings")?;
    if bytes.len() > MAX_SETTINGS_BYTES {
        return Err(
            "Settings would exceed the size limit. Your previous settings were retained.".into(),
        );
    }
    let parent = path.parent().ok_or("Invalid settings location")?;
    std::fs::create_dir_all(parent).map_err(|_| "Could not create settings directory")?;
    let mut file =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not prepare settings save")?;
    file.write_all(&bytes)
        .map_err(|_| "Could not write settings")?;
    file.flush().map_err(|_| "Could not flush settings")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Could not sync settings")?;
    file.persist(path)
        .map_err(|_| "Could not replace settings file. Your previous settings were retained.")?;
    Ok(())
}
pub fn store(app: &tauri::AppHandle) -> Result<Arc<Preferences>, String> {
    app.state::<PreferencesState>().0.clone()
}
#[cfg(not(feature = "integration-test"))]
pub fn initialize(app: &tauri::AppHandle) -> PreferencesState {
    PreferencesState(
        app.path()
            .app_data_dir()
            .map_err(|_| "App data directory unavailable".to_string())
            .and_then(|dir| Preferences::load(dir.join(".settings.dat")))
            .map(Arc::new),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serialized_byte_limit_round_trips_and_rejection_preserves_disk_and_memory() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let store = Preferences::load(path.clone()).unwrap();
        // Include UTF-8 and JSON escapes: character counts are not byte budgets.
        let prefix = "雪\\\"\n".repeat(100);
        let overhead = serde_json::to_vec(&serde_json::json!({"value": prefix}))
            .unwrap()
            .len();
        let exact = format!("{prefix}{}", "x".repeat(MAX_SETTINGS_BYTES - overhead));
        for length in [exact.len() - 1, exact.len()] {
            let value = serde_json::json!(&exact[..length]);
            store.commit("value", Some(value.clone())).unwrap();
            assert_eq!(
                std::fs::metadata(&path).unwrap().len() as usize,
                MAX_SETTINGS_BYTES - (exact.len() - length)
            );
            assert_eq!(
                Preferences::load(path.clone()).unwrap().get("value"),
                Some(value)
            );
        }
        let original = std::fs::read(&path).unwrap();
        assert!(store
            .commit("value", Some(serde_json::json!(format!("{exact}x"))))
            .unwrap_err()
            .contains("size limit"));
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(store.get("value"), Some(serde_json::json!(exact)));
        assert!(store
            .commit_many([
                ("value", Some(serde_json::json!(format!("{exact}x")))),
                ("api-key-local", Some(serde_json::json!("synthetic"))),
            ])
            .unwrap_err()
            .contains("size limit"));
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(store.get("value"), Some(serde_json::json!(exact)));
        assert_eq!(store.get("api-key-local"), None);
        // Oversized existing files remain untouched and require explicit repair.
        let oversized = [original.as_slice(), b" "].concat();
        std::fs::write(&path, &oversized).unwrap();
        assert!(Preferences::load(path.clone()).is_err());
        assert_eq!(std::fs::read(path).unwrap(), oversized);
    }

    #[test]
    fn saves_legacy_json_atomically_and_failed_write_preserves_memory_and_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.dat");
        std::fs::write(
            &path,
            br#"{"program-folder":"old","api-key":"legacy-fixture"}"#,
        )
        .unwrap();
        let store = Preferences::load(path.clone()).unwrap();
        assert_eq!(
            store.get("api-key"),
            Some(serde_json::json!("legacy-fixture"))
        );
        store.commit("api-key", None).unwrap();
        store
            .commit("program-folder", Some(serde_json::json!("new")))
            .unwrap();
        assert_eq!(
            Preferences::load(path).unwrap().get("program-folder"),
            Some(serde_json::json!("new"))
        );
        let blocked = dir.path().join("cannot-replace-directory");
        std::fs::create_dir(&blocked).unwrap();
        let failed = Preferences {
            path: blocked.clone(),
            values: Mutex::new(BTreeMap::from([("value".into(), serde_json::json!("old"))])),
        };
        assert!(failed
            .commit("value", Some(serde_json::json!("new")))
            .is_err());
        assert_eq!(failed.get("value"), Some(serde_json::json!("old")));
        assert!(blocked.is_dir());
    }

    #[cfg(unix)]
    #[test]
    fn settings_file_is_owner_only_because_it_can_hold_the_api_key() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".settings.dat");
        std::fs::write(&path, b"{}").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        Preferences::load(path.clone())
            .unwrap()
            .commit("api-key-local", Some(serde_json::json!("fixture")))
            .unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn related_timestamps_commit_together_or_both_remain_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let store = Preferences::load(path.clone()).unwrap();
        let changes = || {
            [
                ("last-success", Some(serde_json::json!(42))),
                (
                    "account-uploads",
                    Some(serde_json::json!({"collector": 42})),
                ),
            ]
        };
        store.commit_many(changes()).unwrap();
        let reloaded = Preferences::load(path).unwrap();
        for (key, expected) in changes() {
            assert_eq!(reloaded.get(key), expected);
        }
        let blocked = dir.path().join("blocked");
        std::fs::create_dir(&blocked).unwrap();
        let values = BTreeMap::from([
            ("last-success".into(), serde_json::json!(1)),
            (
                "account-uploads".into(),
                serde_json::json!({"collector": 1}),
            ),
        ]);
        let failed = Preferences {
            path: blocked,
            values: Mutex::new(values.clone()),
        };
        assert!(failed.commit_many(changes()).is_err());
        assert_eq!(*failed.values.lock().unwrap(), values);
    }
}
