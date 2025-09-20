use serde::Serialize;
use tauri_plugin_store::StoreExt;

const WOWTHING_UPLOAD_ENDPOINT: &str = "https://wowthing.org/api/upload/";

#[derive(Serialize)]
struct UploadPayload<'a> {
    #[serde(rename = "apiKey")]
    api_key: &'a str,
    #[serde(rename = "luaFile")]
    lua_file: &'a str,
}

/// Sends a POST request to the WoWthing API with the provided addon snapshot
/// and returns the response string on success.
#[tauri::command]
pub async fn submit_addon_data(app: tauri::AppHandle, file_path: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let store = app
        .store_builder(".settings.dat")
        .build()
        .map_err(|err| err.to_string())?;

    let api_key_value = store
        .get("api-key")
        .ok_or_else(|| "No API key found in settings.".to_string())?;
    let api_key = api_key_value
        .as_str()
        .ok_or_else(|| "API key is not a string.".to_string())?;

    let lua_contents = std::fs::read_to_string(file_path).map_err(|err| err.to_string())?;

    submit_addon_data_internal(&client, WOWTHING_UPLOAD_ENDPOINT, api_key, &lua_contents).await
}

pub(crate) async fn submit_addon_data_internal(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    lua_file: &str,
) -> Result<String, String> {
    let payload = UploadPayload { api_key, lua_file };

    let response = client
        .post(endpoint)
        .json(&payload)
        .header("User-Agent", "WoWthing Sync - Tauri")
        .send()
        .await
        .map_err(|err| err.to_string())?;

    if response.status().is_success() {
        response
            .text()
            .await
            .map(|text| format!("Sync completed: {:?}", text))
            .map_err(|err| err.to_string())
    } else {
        Err(format!(
            "Uh oh! Something unexpected happened: {:?}",
            response.status()
        ))
    }
}
