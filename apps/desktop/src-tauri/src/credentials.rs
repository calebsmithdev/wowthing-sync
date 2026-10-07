//! The key is cached only in Rust memory. Neither IPC nor ordinary preferences expose it.
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, State};

trait Vault {
    fn read(&self) -> Result<Option<String>, String>;
    fn write(&self, key: &str) -> Result<(), String>;
}
struct OsVault;
const LOCKED: &str = "OS credential storage is locked or unavailable. Unlock your keychain/credential service, then save your API key or retry.";
#[cfg(not(feature = "integration-test"))]
impl OsVault {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("com.calebsmithdev.wowthing-sync", "wowthing-api-key")
            .map_err(|_| LOCKED.into())
    }
}
#[cfg(not(feature = "integration-test"))]
impl Vault for OsVault {
    fn read(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(LOCKED.into()),
        }
    }
    fn write(&self, key: &str) -> Result<(), String> {
        self.entry()?.set_password(key).map_err(|_| LOCKED.into())
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
fn migrate(
    vault: &impl Vault,
    legacy: Option<&str>,
    remove_legacy: impl FnOnce() -> Result<(), String>,
) -> Result<Option<String>, String> {
    let existing = vault.read()?;
    let key = match existing {
        Some(key) => Some(validate_key(&key)?),
        None => legacy.map(validate_key).transpose()?,
    };
    if legacy.is_some() {
        if let Some(key) = &key {
            verified_save(vault, key)?;
            remove_legacy()?;
        }
    }
    Ok(key)
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub has_key: bool,
    pub loaded: bool,
    pub error: Option<String>,
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
) -> Result<ApiKeyStatus, String> {
    verified_save(vault, key)?;
    // The verified vault write is the commit point. Cleanup cannot revert the active key.
    cache.key = Some(key.into());
    cache.status = ApiKeyStatus {
        has_key: true,
        loaded: true,
        error: cleanup().err(),
    };
    Ok(cache.status.clone())
}
impl SecretManager {
    pub fn reload(&self, app: &tauri::AppHandle) -> ApiKeyStatus {
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        let result = (|| {
            let store = crate::preferences::store(app)
                .map_err(|_| "Could not access legacy settings for secure migration".to_string())?;
            let legacy = store.get("api-key");
            migrate(&OsVault, legacy.as_ref().and_then(|v| v.as_str()), || {
                store.commit("api-key", None).map_err(|_| "Key saved securely, but legacy settings cleanup failed. Retry after fixing settings permissions.".to_string())?;
                Ok(())
            })
        })();
        match result {
            Ok(key) => {
                cache.status = ApiKeyStatus {
                    has_key: key.is_some(),
                    loaded: true,
                    error: None,
                };
                cache.key = key;
            }
            Err(error) => {
                cache.key = None;
                cache.status = ApiKeyStatus {
                    has_key: false,
                    loaded: true,
                    error: Some(error),
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
    pub fn key(&self) -> Result<String, String> {
        let cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        cache.key.clone().ok_or_else(|| {
            cache
                .status
                .error
                .clone()
                .unwrap_or_else(|| "Configure your WoWthing API key in Settings.".into())
        })
    }
    fn save(&self, app: &tauri::AppHandle, key: String) -> Result<ApiKeyStatus, String> {
        let key = validate_key(&key)?;
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        save_cached(&mut cache, &OsVault, &key, || {
            let store = crate::preferences::store(app).map_err(|_| {
                "Key saved securely, but legacy settings could not be accessed. Retry saving."
                    .to_string()
            })?;
            store.commit("api-key", None).map_err(|_| "Secure key saved, but legacy cleanup failed. Retry saving after fixing settings permissions.".to_string())?;
            Ok(())
        })
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
            result.error = Some(
                "API key saved securely, but the sync service is unavailable. Restart the app."
                    .into(),
            );
        }
        Ok(result)
    })
    .await
    .map_err(|_| "Could not save API key".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
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
    fn removes_plaintext_only_after_verified_secure_write() {
        let vault = vault();
        let removed = RefCell::new(false);
        assert_eq!(
            migrate(&vault, Some(" test-key "), || {
                *removed.borrow_mut() = true;
                Ok(())
            })
            .unwrap(),
            Some("test-key".into())
        );
        assert!(*removed.borrow());
        assert_eq!(vault.read().unwrap(), Some("test-key".into()));
    }
    #[test]
    fn migration_failures_retain_plaintext_without_fallback() {
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
            let removed = RefCell::new(false);
            assert!(migrate(&vault, Some("test-key"), || {
                *removed.borrow_mut() = true;
                Ok(())
            })
            .is_err());
            assert!(!*removed.borrow());
        }
    }
    #[test]
    fn secure_existing_key_wins_and_cleanup_failure_is_recoverable() {
        let vault = vault();
        vault.write("secure-key").unwrap();
        assert!(migrate(&vault, Some("legacy-key"), || Err("disk failure".into())).is_err());
        assert_eq!(vault.read().unwrap(), Some("secure-key".into()));
        assert_eq!(
            migrate(&vault, Some("legacy-key"), || Ok(())).unwrap(),
            Some("secure-key".into())
        );
    }
    #[test]
    fn replacement_commit_keeps_cache_and_vault_consistent_if_cleanup_fails() {
        let vault = vault();
        let mut cache = SecretCache {
            key: Some("old-key".into()),
            ..Default::default()
        };
        let status = save_cached(&mut cache, &vault, "new-key", || {
            Err("cleanup failed".into())
        })
        .unwrap();
        assert_eq!(cache.key.as_deref(), Some("new-key"));
        assert_eq!(vault.read().unwrap().as_deref(), Some("new-key"));
        assert!(status.has_key);
        assert_eq!(status.error.as_deref(), Some("cleanup failed"));
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
