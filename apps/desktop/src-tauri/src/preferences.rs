//! Typed commands own settings. Writes replace the file atomically; a failed save
//! never commits half-written JSON or changes the hydrated in-memory preferences.
use std::{
    collections::BTreeMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::Manager;

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
                file.take(1024 * 1024 + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| {
                        "Could not read settings. Check app-data permissions.".to_string()
                    })?;
                Some(bytes)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err("Could not read settings. Check app-data permissions.".into()),
        };
        let values = match bytes {
            Some(bytes) if bytes.len() <= 1024 * 1024 => {
                serde_json::from_slice(&bytes).map_err(|_| {
                    "Settings file is invalid. Repair or restore it before saving settings."
                        .to_string()
                })?
            }
            Some(_) => return Err("Settings file exceeds the size limit".into()),
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
        let mut values = self.values.lock().unwrap_or_else(|e| e.into_inner());
        let mut updated = values.clone();
        if let Some(value) = value {
            updated.insert(key.into(), value);
        } else {
            updated.remove(key);
        }
        write_atomic(&self.path, &updated)?;
        *values = updated;
        Ok(())
    }
}
fn write_atomic(path: &Path, values: &BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid settings location")?;
    std::fs::create_dir_all(parent).map_err(|_| "Could not create settings directory")?;
    let mut file =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not prepare settings save")?;
    serde_json::to_writer(&mut file, values).map_err(|_| "Could not write settings")?;
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
}
