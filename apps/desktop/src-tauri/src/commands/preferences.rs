use tauri::{Manager, State};
use tauri_plugin_store::StoreExt;

fn allowed(key: &str) -> Result<(), String> {
    match key {
        "program-folder"
        | "auto-start"
        | "notifications-enabled"
        | "last-updated"
        | "last-success" => Ok(()),
        _ => Err("Unknown preference".into()),
    }
}
#[tauri::command]
pub fn get_preference(
    app: tauri::AppHandle,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    allowed(&key)?;
    Ok(app
        .store(".settings.dat")
        .map_err(|_| "Could not read preferences".to_string())?
        .get(&key))
}
#[tauri::command]
pub fn save_preference(
    app: tauri::AppHandle,
    service: State<'_, crate::sync_service::SyncService>,
    key: String,
    value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    allowed(&key)?;
    let value = match key.as_str() {
        "program-folder" => {
            let path = value.as_str().ok_or("Folder must be a string")?;
            crate::sync_service::validate_folder(std::path::Path::new(path))?;
            serde_json::json!(std::path::Path::new(path)
                .canonicalize()
                .map_err(|_| "Folder unavailable")?
                .to_string_lossy())
        }
        "auto-start" | "notifications-enabled" if value.is_boolean() => value,
        _ => return Err("Preference is read-only or has an invalid type".into()),
    };
    let store = app
        .store(".settings.dat")
        .map_err(|_| "Could not access preferences".to_string())?;
    let previous = store.get(&key);
    store.set(&key, value.clone());
    if store.save().is_err() {
        if let Some(previous) = previous {
            store.set(&key, previous);
        } else {
            store.delete(&key);
        }
        return Err("Could not save preferences".into());
    }
    if key == "program-folder" {
        service.configure(value.as_str().map(String::from))?;
    }
    Ok(value)
}
#[tauri::command]
pub fn default_wow_folder(app: tauri::AppHandle) -> Result<String, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| "Home directory unavailable")?;
    let mut candidates = vec![
        std::path::PathBuf::from("/Applications/World of Warcraft/_retail_"),
        std::path::PathBuf::from(r"C:\Program Files (x86)\World of Warcraft\_retail_"),
    ];
    for relative in [
        ".wine/drive_c/Program Files (x86)/World of Warcraft/_retail_",
        ".wine/drive_c/Program Files/World of Warcraft/_retail_",
        "Games/world-of-warcraft/drive_c/Program Files (x86)/World of Warcraft/_retail_",
    ] {
        candidates.push(home.join(relative));
    }
    Ok(candidates
        .into_iter()
        .find(|path| path.join("WTF/Account").is_dir())
        .unwrap_or(home)
        .to_string_lossy()
        .into_owned())
}
