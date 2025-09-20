use crate::commands::submit_addon_data::submit_addon_data_internal;
use httpmock::prelude::*;
use serde_json::json;

#[tokio::test]
async fn submits_payload_and_returns_success_message() {
    let server = MockServer::start_async().await;
    let client = reqwest::Client::new();
    let api_key = "abc123";
    let lua_file = "some lua";

    let mock = server
        .mock_async(|when, then| {
            when.method(POST)
                .path("/upload/")
                .header("user-agent", "WoWthing Sync - Tauri")
                .json_body_obj(&json!({
                    "apiKey": api_key,
                    "luaFile": lua_file,
                }));
            then.status(200).body("{\"message\":\"ok\"}");
        })
        .await;

    let result = submit_addon_data_internal(
        &client,
        &format!("{}/upload/", server.base_url()),
        api_key,
        lua_file,
    )
    .await
    .unwrap();

    assert!(result.contains("Sync completed"));
    mock.assert_async().await;
}

#[tokio::test]
async fn returns_error_on_unsuccessful_response() {
    let server = MockServer::start_async().await;
    let client = reqwest::Client::new();

    server
        .mock_async(|when, then| {
            when.method(POST).path("/upload/");
            then.status(500).body("server error");
        })
        .await;

    let err = submit_addon_data_internal(
        &client,
        &format!("{}/upload/", server.base_url()),
        "abc123",
        "contents",
    )
    .await
    .unwrap_err();

    assert!(err.contains("unexpected"));
}
