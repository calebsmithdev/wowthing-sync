use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

#[derive(Default)]
pub struct SettingsManager {
    gate: Mutex<()>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    folder: Option<String>,
    has_api_key: bool,
    auto_start: Option<bool>,
    auto_start_error: Option<String>,
    notifications_enabled: bool,
    notification_permission: &'static str,
}
fn snapshot(app: &tauri::AppHandle) -> Result<SettingsSnapshot, String> {
    let store =
        crate::preferences::store(app).map_err(|_| "Could not read settings".to_string())?;
    let auto_start = app
        .autolaunch()
        .is_enabled()
        .map_err(|_| "Could not read launch-at-login status. Check OS login settings.".to_string());
    Ok(SettingsSnapshot {
        folder: store
            .get("program-folder")
            .and_then(|v| v.as_str().map(String::from)),
        has_api_key: app
            .state::<crate::credentials::SecretManager>()
            .status()
            .has_key,
        auto_start: auto_start.clone().ok(),
        auto_start_error: auto_start.err(),
        notifications_enabled: store
            .get("notifications-enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        // The desktop notification plugin always returns Granted, independently of OS
        // delivery settings. Reporting unknown is more truthful than claiming consent.
        notification_permission: "unknown",
    })
}
fn persist(
    store: &crate::preferences::Preferences,
    key: &str,
    value: serde_json::Value,
) -> Result<(), String> {
    store.commit(key, Some(value))
}
fn commit_folder(
    root: crate::collector_fs::ApprovedRoot,
    persist: impl FnOnce(&str) -> Result<(), String>,
    activate: impl FnOnce(crate::collector_fs::ApprovedRoot) -> Result<(), String>,
    rollback: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let folder = root.path().to_string_lossy().into_owned();
    persist(&folder)?;
    if let Err(error) = activate(root) {
        return match rollback() {
            Ok(()) => Err(error),
            Err(_) => Err(format!(
                "{error}. Could not restore saved folder; restart the app and check Settings."
            )),
        };
    }
    Ok(())
}
trait AutoStart {
    fn actual(&self) -> Result<bool, String>;
    fn set(&self, enabled: bool) -> Result<(), String>;
}
struct NativeAutoStart<'a>(&'a tauri::AppHandle);
impl AutoStart for NativeAutoStart<'_> {
    fn actual(&self) -> Result<bool, String> {
        self.0
            .autolaunch()
            .is_enabled()
            .map_err(|_| "Could not read launch-at-login status".into())
    }
    fn set(&self, enabled: bool) -> Result<(), String> {
        if enabled {
            self.0.autolaunch().enable()
        } else {
            self.0.autolaunch().disable()
        }
        .map_err(|_| "Could not change launch-at-login registration".into())
    }
}
fn commit_autostart(
    os: &impl AutoStart,
    enabled: bool,
    persist: impl FnOnce(bool) -> Result<(), String>,
) -> Result<(), String> {
    let previous = os.actual()?;
    let commit = (|| {
        os.set(enabled)?;
        if os.actual()? != enabled {
            return Err("OS did not accept launch-at-login change".into());
        }
        persist(enabled)
    })();
    if let Err(error) = commit {
        if os.set(previous).is_err() || os.actual().ok() != Some(previous) {
            return Err(format!(
                "{error}. Rollback failed; check launch-at-login in OS settings."
            ));
        }
        return Err(error);
    }
    Ok(())
}
#[tauri::command]
pub async fn get_settings(app: tauri::AppHandle) -> Result<SettingsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = app.state::<SettingsManager>();
        let _guard = manager.gate.lock().unwrap_or_else(|e| e.into_inner());
        snapshot(&app)
    })
    .await
    .map_err(|_| "Could not load settings".to_string())?
}
#[tauri::command]
pub async fn save_sync_folder(
    app: tauri::AppHandle,
    folder: String,
) -> Result<SettingsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = app.state::<SettingsManager>();
        let _guard = manager.gate.lock().unwrap_or_else(|e| e.into_inner());
        // Prepare and hold the validated capability once. Enqueue it without another
        // path lookup between persistence and activation.
        let root = crate::collector_fs::ApprovedRoot::open(std::path::Path::new(&folder))?;
        if root.discover()?.is_empty() {
            return Err(
                "No collector files found. Enable the addon and log out of WoW before saving."
                    .into(),
            );
        }
        let store =
            crate::preferences::store(&app).map_err(|_| "Could not access settings".to_string())?;
        let previous = store.get("program-folder");
        commit_folder(
            root,
            |folder| persist(&store, "program-folder", serde_json::json!(folder)),
            |root| {
                app.state::<crate::sync_service::SyncService>()
                    .configure(Some(root))
            },
            || store.commit("program-folder", previous),
        )?;
        snapshot(&app)
    })
    .await
    .map_err(|_| "Could not save folder".to_string())?
}
#[tauri::command]
pub async fn set_autostart(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<SettingsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = app.state::<SettingsManager>();
        let _guard = manager.gate.lock().unwrap_or_else(|e| e.into_inner());
        let store =
            crate::preferences::store(&app).map_err(|_| "Could not access settings".to_string())?;
        commit_autostart(&NativeAutoStart(&app), enabled, |value| {
            persist(&store, "auto-start", serde_json::json!(value))
        })?;
        snapshot(&app)
    })
    .await
    .map_err(|_| "Could not save launch-at-login setting".to_string())?
}
#[tauri::command]
pub async fn set_notifications(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<SettingsSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = app.state::<SettingsManager>();
        let _guard = manager.gate.lock().unwrap_or_else(|e| e.into_inner());
        let store =
            crate::preferences::store(&app).map_err(|_| "Could not access settings".to_string())?;
        persist(&store, "notifications-enabled", serde_json::json!(enabled))?;
        snapshot(&app)
    })
    .await
    .map_err(|_| "Could not save notification preference".to_string())?
}
#[tauri::command]
pub fn default_wow_folder(app: tauri::AppHandle) -> Result<String, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| "Home directory unavailable")?;
    let candidates = [
        std::path::PathBuf::from("/Applications/World of Warcraft/_retail_"),
        std::path::PathBuf::from(r"C:\Program Files (x86)\World of Warcraft\_retail_"),
        home.join(".wine/drive_c/Program Files (x86)/World of Warcraft/_retail_"),
        home.join(".wine/drive_c/Program Files/World of Warcraft/_retail_"),
        home.join("Games/world-of-warcraft/drive_c/Program Files (x86)/World of Warcraft/_retail_"),
    ];
    Ok(candidates
        .into_iter()
        .find(|path| path.join("WTF/Account").is_dir())
        .unwrap_or(home)
        .to_string_lossy()
        .into_owned())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    struct FakeStart {
        enabled: Cell<bool>,
        fail: bool,
        reject: bool,
    }
    impl AutoStart for FakeStart {
        fn actual(&self) -> Result<bool, String> {
            Ok(self.enabled.get())
        }
        fn set(&self, enabled: bool) -> Result<(), String> {
            if self.fail && enabled {
                return Err("registration failed".into());
            }
            if !self.reject {
                self.enabled.set(enabled);
            }
            Ok(())
        }
    }
    #[test]
    fn autostart_changes_only_commit_after_os_success_and_disk_failure_rolls_back() {
        for (fail, reject, disk_fail) in [
            (true, false, false),
            (false, true, false),
            (false, false, true),
        ] {
            let os = FakeStart {
                enabled: Cell::new(false),
                fail,
                reject,
            };
            let saved = Cell::new(false);
            assert!(commit_autostart(&os, true, |value| {
                if disk_fail {
                    Err("disk failed".into())
                } else {
                    saved.set(value);
                    Ok(())
                }
            })
            .is_err());
            assert!(!os.enabled.get());
            assert!(!saved.get());
        }
        let os = FakeStart {
            enabled: Cell::new(false),
            fail: false,
            reject: false,
        };
        commit_autostart(&os, true, |_| Ok(())).unwrap();
        assert!(os.enabled.get());
    }
    #[test]
    fn failed_folder_activation_rolls_back_and_disk_failure_does_not_activate() {
        let root = std::env::temp_dir().join(format!("wowthing-setting-{}", std::process::id()));
        std::fs::create_dir_all(root.join("WTF/Account")).unwrap();
        let rolled_back = Cell::new(false);
        assert!(commit_folder(
            crate::collector_fs::ApprovedRoot::open(&root).unwrap(),
            |_| Ok(()),
            |_| Err("service stopped".into()),
            || {
                rolled_back.set(true);
                Ok(())
            }
        )
        .is_err());
        assert!(rolled_back.get());
        assert!(commit_folder(
            crate::collector_fs::ApprovedRoot::open(&root).unwrap(),
            |_| Err("disk failure".into()),
            |_| panic!("must not activate before disk commit"),
            || Ok(())
        )
        .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
