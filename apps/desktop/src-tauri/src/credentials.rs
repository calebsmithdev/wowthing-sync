//! The key is cached only in Rust memory. Neither IPC nor ordinary preferences expose it.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

trait Vault {
    fn read(&self) -> Result<Option<String>, String>;
    fn write(&self, key: &str) -> Result<(), String>;
}
#[cfg_attr(feature = "integration-test", derive(Default))]
struct OsVault {
    #[cfg(not(feature = "integration-test"))]
    service: String,
    #[cfg(not(feature = "integration-test"))]
    account: String,
}
#[cfg(not(feature = "integration-test"))]
impl Default for OsVault {
    fn default() -> Self {
        Self {
            #[cfg(not(feature = "integration-test"))]
            service: "com.calebsmithdev.wowthing-sync".into(),
            #[cfg(not(feature = "integration-test"))]
            account: "wowthing-api-key".into(),
        }
    }
}
#[cfg(not(target_os = "linux"))]
const LOCKED: &str = "Could not open your system credential store. Unlock it and retry, or save your API key again to keep it in this app's settings file.";
#[cfg(target_os = "linux")]
const LOCKED: &str = "Could not open your system credential store (Secret Service: KWallet, GNOME Keyring or KeePassXC). Unlock it and retry, or save your API key again to keep it in this app's settings file.";
/// Logs the backend's reason; keyring errors describe the store, never the secret.
#[cfg(not(feature = "integration-test"))]
fn unavailable(operation: &str, error: keyring::Error) -> String {
    log::error!("Credential store {operation} failed: {error}");
    LOCKED.into()
}
#[cfg(not(feature = "integration-test"))]
impl OsVault {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, &self.account).map_err(|e| unavailable("open", e))
    }
}
#[cfg(not(feature = "integration-test"))]
impl Vault for OsVault {
    fn read(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(unavailable("read", error)),
        }
    }
    fn write(&self, key: &str) -> Result<(), String> {
        self.entry()?
            .set_password(key)
            .map_err(|e| unavailable("write", e))
    }
}
#[cfg(feature = "integration-test")]
impl Vault for OsVault {
    fn read(&self) -> Result<Option<String>, String> {
        match std::fs::read_to_string(crate::integration::root().join("synthetic-vault")) {
            Ok(key) if key == "smoke-fixture-key" => Ok(Some(key)),
            Ok(_) => Err("Invalid synthetic vault fixture".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(LOCKED.into()),
        }
    }
    fn write(&self, key: &str) -> Result<(), String> {
        if key != "smoke-fixture-key" {
            return Err("Only the synthetic test key is accepted".into());
        }
        std::fs::write(crate::integration::root().join("synthetic-vault"), key)
            .map_err(|_| LOCKED.into())
    }
}
pub(crate) fn validate_key(value: &str) -> Result<String, String> {
    let key = value.trim();
    if key.is_empty() || key.len() > 512 || !key.bytes().all(|c| c.is_ascii_graphic()) {
        return Err(
            "Enter a nonempty WoWthing API key without spaces (at most 512 characters).".into(),
        );
    }
    Ok(key.into())
}
fn verified_save(vault: &impl Vault, key: &str) -> Result<(), String> {
    vault.write(key)?;
    if vault.read()?.as_deref() != Some(key) {
        return Err(
            "Could not verify secure API key storage. Your previous preferences were retained."
                .into(),
        );
    }
    Ok(())
}
/// Returns the active key and whether it lives in the settings file. The API key is only
/// a transmission key, so an unusable vault falls back to the owner-only settings file
/// instead of blocking sync. A local key stays there until the user saves again, so
/// startup never touches (or prompts to unlock) the vault for it. A legacy key predates
/// the vault: a readable vault key always wins over it, and the legacy key is only used
/// in place when the vault cannot be read or cannot accept it.
fn load_key(
    vault: &impl Vault,
    store: &crate::preferences::Preferences,
) -> Result<(Option<String>, bool), String> {
    let local = store.get(LOCAL_KEY);
    if let Some(key) = local.as_ref().and_then(|v| v.as_str()) {
        match validate_key(key) {
            Ok(key) => return Ok((Some(key), true)),
            Err(_) => log::warn!("Ignoring an invalid API key in the settings file"),
        }
    }
    let legacy = store.get(LEGACY_KEY);
    let legacy = legacy.as_ref().and_then(|v| v.as_str());
    let cleanup = || {
        if let Err(error) = remove_plaintext(store) {
            log::warn!("Could not remove the API key from the settings file: {error}");
        }
    };
    let existing = match vault.read() {
        Ok(existing) => existing,
        Err(error) => {
            return match legacy.map(validate_key) {
                Some(Ok(key)) => {
                    log::warn!("Using the API key from the settings file: {error}");
                    Ok((Some(key), true))
                }
                _ => Err(error),
            }
        }
    };
    if let Some(key) = existing {
        let key = validate_key(&key)?;
        if legacy.is_some() {
            cleanup();
        }
        return Ok((Some(key), false));
    }
    let Some(legacy) = legacy else {
        return Ok((None, false));
    };
    let key = validate_key(legacy)?;
    match verified_save(vault, &key) {
        Ok(()) => {
            cleanup();
            Ok((Some(key), false))
        }
        Err(error) => {
            log::warn!("Using the API key from the settings file: {error}");
            Ok((Some(key), true))
        }
    }
}
/// Settings-file entry for a key saved while the vault was unusable.
const LOCAL_KEY: &str = "api-key-local";
/// Settings-file entry from versions before the vault.
const LEGACY_KEY: &str = "api-key";
fn remove_plaintext(store: &crate::preferences::Preferences) -> Result<(), String> {
    if store.get(LOCAL_KEY).is_none() && store.get(LEGACY_KEY).is_none() {
        return Ok(());
    }
    store.commit_many([(LOCAL_KEY, None), (LEGACY_KEY, None)])
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub has_key: bool,
    pub loaded: bool,
    pub error: Option<String>,
    /// The key is in the settings file because the OS credential store was unusable.
    pub stored_locally: bool,
}
#[derive(Default)]
struct SecretCache {
    key: Option<String>,
    status: ApiKeyStatus,
}
#[derive(Default)]
pub struct SecretManager {
    cache: Mutex<SecretCache>,
}
fn save_cached(
    cache: &mut SecretCache,
    vault: &impl Vault,
    key: &str,
    cleanup: impl FnOnce() -> Result<(), String>,
    save_locally: impl FnOnce() -> Result<(), String>,
) -> Result<ApiKeyStatus, String> {
    // A verified vault write or the local fallback write is the commit point. Cleanup
    // cannot revert the active key.
    let (stored_locally, error) = match verified_save(vault, key) {
        Ok(()) => (false, cleanup().err()),
        Err(vault_error) => {
            save_locally().map_err(|_| vault_error.clone())?;
            log::warn!("Saved the API key to the settings file: {vault_error}");
            (true, None)
        }
    };
    cache.key = Some(key.into());
    cache.status = ApiKeyStatus {
        has_key: true,
        loaded: true,
        error,
        stored_locally,
    };
    Ok(cache.status.clone())
}
fn save_key(
    cache: &mut SecretCache,
    vault: &impl Vault,
    store: Result<&crate::preferences::Preferences, &String>,
    key: &str,
) -> Result<ApiKeyStatus, String> {
    // A local key outranks the vault on reload, so it must never be older than the
    // vault. Replace it first; then a later cleanup failure leaves the newest key.
    if let Ok(store) = store {
        if store.get(LOCAL_KEY).is_some() {
            store
                .commit(LOCAL_KEY, Some(serde_json::json!(key)))
                .map_err(|_| "Could not update the API key in the settings file. Fix settings permissions and retry saving.".to_string())?;
        }
    }
    save_cached(
        cache,
        vault,
        key,
        || {
            let store = store.map_err(|_| {
                "Key saved securely, but legacy settings could not be accessed. Retry saving."
                    .to_string()
            })?;
            remove_plaintext(store).map_err(|_| "Secure key saved, but legacy cleanup failed. Retry saving after fixing settings permissions.".to_string())
        },
        || {
            store.map_err(Clone::clone)?.commit_many([
                (LOCAL_KEY, Some(serde_json::json!(key))),
                (LEGACY_KEY, None),
            ])
        },
    )
}
impl SecretManager {
    pub fn reload(&self, app: &tauri::AppHandle) -> ApiKeyStatus {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let result = (|| {
            let store = crate::preferences::store(app)
                .map_err(|_| "Could not access legacy settings for secure migration".to_string())?;
            load_key(&OsVault::default(), &store)
        })();
        match result {
            Ok((key, stored_locally)) => {
                cache.status = ApiKeyStatus {
                    has_key: key.is_some(),
                    loaded: true,
                    error: None,
                    stored_locally,
                };
                cache.key = key;
            }
            Err(error) => {
                cache.key = None;
                cache.status = ApiKeyStatus {
                    has_key: false,
                    loaded: true,
                    error: Some(error),
                    stored_locally: false,
                };
            }
        }
        cache.status.clone()
    }
    pub fn status(&self) -> ApiKeyStatus {
        self.cache
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .status
            .clone()
    }
    /// An unsaved key is expected during setup; a vault failure is still an error.
    pub fn key(&self) -> Result<Option<String>, String> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        match (&cache.key, &cache.status.error) {
            (Some(key), _) => Ok(Some(key.clone())),
            (None, Some(error)) => Err(error.clone()),
            (None, None) => Ok(None),
        }
    }
    fn save(&self, app: &tauri::AppHandle, key: String) -> Result<ApiKeyStatus, String> {
        let key = validate_key(&key)?;
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let store = crate::preferences::store(app);
        save_key(&mut cache, &OsVault::default(), store.as_deref(), &key)
    }
}
#[tauri::command]
pub fn get_api_key_status(secrets: State<'_, SecretManager>) -> ApiKeyStatus {
    secrets.status()
}
#[tauri::command]
pub async fn save_api_key(app: tauri::AppHandle, key: String) -> Result<ApiKeyStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut result = app.state::<SecretManager>().save(&app, key)?;
        if app
            .state::<crate::sync_service::SyncService>()
            .manual()
            .is_err()
        {
            result.error =
                Some("API key saved, but the sync service is unavailable. Restart the app.".into());
        }
        Ok(result)
    })
    .await
    .map_err(|_| "Could not save API key".to_string())?
}
#[cfg(feature = "os-integration-test")]
pub(crate) fn ci_roundtrip(identity: &str) -> Result<(), String> {
    let vault = OsVault {
        service: format!("com.calebsmithdev.{identity}"),
        account: "synthetic-ci-account".into(),
    };
    if vault.read()?.is_some() {
        return Err("unique credential identity unexpectedly exists".into());
    }
    let result = (|| {
        verified_save(&vault, "synthetic-first-key")?;
        verified_save(&vault, "synthetic-updated-key")?;
        Ok(())
    })();
    let cleanup = vault
        .entry()?
        .delete_credential()
        .map_err(|_| "Could not remove synthetic credential".to_string());
    cleanup?;
    if vault.read()?.is_some() {
        return Err("Synthetic credential still exists after deletion".into());
    }
    result
}
#[cfg(feature = "os-integration-test")]
pub(crate) fn ci_unavailable(identity: &str) -> Result<(), String> {
    let vault = OsVault {
        service: format!("com.calebsmithdev.{identity}"),
        account: "synthetic-ci-account".into(),
    };
    if vault.read().is_ok() {
        return Err(
            "Credential backend unexpectedly available; unavailable probe did not execute".into(),
        );
    }
    // Real backend errors must reach the settings-file fallback for save and reload.
    let dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let store = crate::preferences::Preferences::load(dir.path().join(".settings.dat"))?;
    let status = save_key(
        &mut SecretCache::default(),
        &vault,
        Ok(&store),
        "synthetic-fallback-key",
    )?;
    if !status.stored_locally {
        return Err("Unavailable backend save did not fall back to the settings file".into());
    }
    let reloaded = crate::preferences::Preferences::load(dir.path().join(".settings.dat"))?;
    match load_key(&vault, &reloaded)? {
        (Some(key), true) if key == "synthetic-fallback-key" => Ok(()),
        _ => Err("Settings-file fallback key did not reload".into()),
    }
}

#[cfg(feature = "os-integration-test")]
pub(crate) fn ci_cleanup(identity: &str) -> Result<(), String> {
    let vault = OsVault {
        service: format!("com.calebsmithdev.{identity}"),
        account: "synthetic-ci-account".into(),
    };
    match vault.entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => return Err("Synthetic credential cleanup failed".into()),
    }
    if vault.read()?.is_some() {
        Err("Synthetic credential remains after cleanup".into())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[test]
    fn missing_cached_key_is_setup_but_vault_errors_remain_actionable() {
        let secrets = SecretManager::default();
        assert_eq!(secrets.key(), Ok(None));
        secrets.cache.lock().unwrap().status.error = Some(LOCKED.into());
        assert_eq!(secrets.key(), Err(LOCKED.into()));
        // A committed secure key still works after a legacy cleanup warning.
        secrets.cache.lock().unwrap().key = Some("synthetic-key".into());
        assert_eq!(secrets.key(), Ok(Some("synthetic-key".into())));
    }
    struct FakeVault {
        value: RefCell<Option<String>>,
        fail_write: bool,
        fail_read: bool,
        corrupt: bool,
    }
    impl Vault for FakeVault {
        fn read(&self) -> Result<Option<String>, String> {
            if self.fail_read {
                Err("locked".into())
            } else {
                Ok(self.value.borrow().clone())
            }
        }
        fn write(&self, key: &str) -> Result<(), String> {
            if self.fail_write {
                Err("locked".into())
            } else {
                *self.value.borrow_mut() = Some(if self.corrupt {
                    "wrong".into()
                } else {
                    key.into()
                });
                Ok(())
            }
        }
    }
    fn vault() -> FakeVault {
        FakeVault {
            value: RefCell::new(None),
            fail_write: false,
            fail_read: false,
            corrupt: false,
        }
    }
    #[test]
    fn legacy_key_is_removed_only_after_a_verified_vault_write() {
        let (_dir, store) = settings(serde_json::json!({"api-key": " test-key "}));
        let working = vault();
        assert_eq!(
            load_key(&working, &store),
            Ok((Some("test-key".into()), false))
        );
        assert_eq!(store.get(LEGACY_KEY), None);
        assert_eq!(working.read().unwrap(), Some("test-key".into()));
        for (fail_write, corrupt) in [(true, false), (false, true)] {
            let (_dir, store) = settings(serde_json::json!({"api-key": "test-key"}));
            let vault = FakeVault {
                fail_write,
                corrupt,
                ..vault()
            };
            assert_eq!(
                load_key(&vault, &store),
                Ok((Some("test-key".into()), true))
            );
            assert_eq!(store.get(LEGACY_KEY), Some(serde_json::json!("test-key")));
        }
    }
    #[test]
    fn readable_vault_key_wins_over_legacy_even_if_cleanup_fails() {
        let (dir, store) = settings(serde_json::json!({"api-key": "legacy-key"}));
        make_unwritable(&dir);
        let vault = vault();
        vault.write("secure-key").unwrap();
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("secure-key".into()), false))
        );
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("secure-key".into()), false))
        );
        assert_eq!(vault.read().unwrap(), Some("secure-key".into()));
    }
    #[test]
    fn replacement_commit_keeps_cache_and_vault_consistent_if_cleanup_fails() {
        let vault = vault();
        let mut cache = SecretCache {
            key: Some("old-key".into()),
            ..Default::default()
        };
        let status = save_cached(
            &mut cache,
            &vault,
            "new-key",
            || Err("cleanup failed".into()),
            || panic!("a working vault must not fall back"),
        )
        .unwrap();
        assert_eq!(cache.key.as_deref(), Some("new-key"));
        assert_eq!(vault.read().unwrap().as_deref(), Some("new-key"));
        assert!(status.has_key);
        assert!(!status.stored_locally);
        assert_eq!(status.error.as_deref(), Some("cleanup failed"));
    }
    fn settings(values: serde_json::Value) -> (tempfile::TempDir, crate::preferences::Preferences) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".settings.dat");
        std::fs::write(&path, values.to_string()).unwrap();
        let store = crate::preferences::Preferences::load(path).unwrap();
        (dir, store)
    }
    fn make_unwritable(dir: &tempfile::TempDir) {
        let path = dir.path().join(".settings.dat");
        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir(&path).unwrap();
    }
    fn unusable_vault() -> FakeVault {
        FakeVault {
            fail_read: true,
            fail_write: true,
            ..vault()
        }
    }
    #[test]
    fn local_key_is_used_without_touching_the_vault() {
        let (_dir, store) = settings(serde_json::json!({"api-key-local": "local-key"}));
        let vault = unusable_vault();
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("local-key".into()), true))
        );
        assert_eq!(store.get(LOCAL_KEY), Some(serde_json::json!("local-key")));
    }
    #[test]
    fn invalid_local_key_is_ignored_in_favor_of_the_vault() {
        let (_dir, store) = settings(serde_json::json!({"api-key-local": "a b"}));
        let vault = vault();
        vault.write("vault-key").unwrap();
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("vault-key".into()), false))
        );
    }
    #[test]
    fn legacy_key_moves_into_a_working_vault_or_is_used_in_place() {
        let (_dir, store) = settings(serde_json::json!({"api-key": "legacy-key"}));
        let vault = vault();
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("legacy-key".into()), false))
        );
        assert_eq!(store.get(LEGACY_KEY), None);
        assert_eq!(vault.read().unwrap().as_deref(), Some("legacy-key"));

        let (_dir, store) = settings(serde_json::json!({"api-key": "legacy-key"}));
        assert_eq!(
            load_key(&unusable_vault(), &store),
            Ok((Some("legacy-key".into()), true))
        );
        assert_eq!(store.get(LEGACY_KEY), Some(serde_json::json!("legacy-key")));
        assert_eq!(
            load_key(&unusable_vault(), &settings(serde_json::json!({})).1),
            Err("locked".into())
        );
    }
    #[test]
    fn saving_replaces_a_local_key_and_reloads_from_where_it_was_saved() {
        let (_dir, store) = settings(serde_json::json!({"api-key-local": "old-key"}));
        let vault = vault();
        let status = save_key(&mut SecretCache::default(), &vault, Ok(&store), "new-key").unwrap();
        assert!(!status.stored_locally);
        assert_eq!(store.get(LOCAL_KEY), None);
        assert_eq!(
            load_key(&vault, &store),
            Ok((Some("new-key".into()), false))
        );

        let (_dir, store) = settings(serde_json::json!({"api-key": "legacy-key"}));
        let vault = unusable_vault();
        let status = save_key(&mut SecretCache::default(), &vault, Ok(&store), "new-key").unwrap();
        assert!(status.stored_locally);
        assert_eq!(store.get(LEGACY_KEY), None);
        assert_eq!(load_key(&vault, &store), Ok((Some("new-key".into()), true)));
    }
    #[test]
    fn unwritable_settings_with_a_local_key_fail_the_whole_save() {
        let (dir, store) = settings(serde_json::json!({"api-key-local": "old-key"}));
        make_unwritable(&dir);
        let vault = vault();
        let mut cache = SecretCache {
            key: Some("old-key".into()),
            ..Default::default()
        };
        assert!(save_key(&mut cache, &vault, Ok(&store), "new-key").is_err());
        assert_eq!(cache.key.as_deref(), Some("old-key"));
        assert_eq!(vault.read().unwrap(), None);
        assert_eq!(store.get(LOCAL_KEY), Some(serde_json::json!("old-key")));
    }
    #[test]
    fn cleanup_without_settings_file_keys_does_not_write() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(".settings.dat");
        let store = crate::preferences::Preferences::load(path.clone()).unwrap();
        remove_plaintext(&store).unwrap();
        assert!(!path.exists());
    }
    #[test]
    fn failed_vault_save_falls_back_to_the_settings_file() {
        for (fail_write, fail_read, corrupt) in [
            (true, false, false),
            (false, true, false),
            (false, false, true),
        ] {
            let vault = FakeVault {
                fail_write,
                fail_read,
                corrupt,
                ..vault()
            };
            let mut cache = SecretCache::default();
            let saved = RefCell::new(false);
            let status = save_cached(
                &mut cache,
                &vault,
                "new-key",
                || panic!("cleanup only follows a verified vault write"),
                || {
                    *saved.borrow_mut() = true;
                    Ok(())
                },
            )
            .unwrap();
            assert!(*saved.borrow());
            assert!(status.has_key && status.stored_locally && status.error.is_none());
            assert_eq!(cache.key.as_deref(), Some("new-key"));
        }
    }
    #[test]
    fn failed_fallback_save_reports_the_vault_error_and_keeps_the_old_key() {
        let vault = FakeVault {
            fail_write: true,
            ..vault()
        };
        let mut cache = SecretCache {
            key: Some("old-key".into()),
            ..Default::default()
        };
        let result = save_cached(
            &mut cache,
            &vault,
            "new-key",
            || panic!("cleanup only follows a verified vault write"),
            || Err("disk failure".into()),
        );
        assert_eq!(result.err().as_deref(), Some("locked"));
        assert_eq!(cache.key.as_deref(), Some("old-key"));
    }
    #[test]
    fn validates_keys_without_including_them_in_errors() {
        assert_eq!(validate_key(" key-value \n").unwrap(), "key-value");
        for key in ["", "a b", "a\nb", "é"] {
            assert!(validate_key(key).is_err());
        }
        assert!(validate_key(&"x".repeat(513)).is_err());
    }
}
