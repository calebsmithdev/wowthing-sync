use std::collections::HashMap;

use tauri_plugin_store::StoreExt;

/// Sends a POST request to the WoWthing API with the provided form data and returns the response.
///
/// ## Arguments
///
/// * `form_data` - The form data to be sent in the request body.
///
/// ## Returns
///
/// The response from the WoWthing API.
#[tauri::command]
pub async fn submit_addon_data(app: tauri::AppHandle, file_path: &str) -> Result<String, String> {
    let store = app.store_builder(".settings.dat").build().unwrap();
    let api_key = store.get("api-key").expect("No API key found in settings.");
    let contents = &std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;

    let mut form_data = HashMap::new();
    form_data.insert("apiKey", api_key.as_str().unwrap());
    form_data.insert("luaFile", &contents);

    let client = reqwest::Client::new();
    let response = client
        .post("https://wowthing.org/api/upload/")
        .json(&form_data)
        .header("User-Agent", "WoWthing Sync - Tauri")
        .send()
        .await
        .unwrap();

    match response.status() {
        reqwest::StatusCode::OK => match response.text().await {
            Ok(text) => Ok(format!("Sync completed: {:?}", text)),
            Err(_) => Err("There was an issue reading the response.".into()),
        },
        other => Err(format!("Uh oh! Something unexpected happened: {:?}", other)),
    }
}
