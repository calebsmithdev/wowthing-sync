use serde::Serialize;
use std::{future::Future, time::Duration};
use tauri_plugin_store::StoreExt;

const WOWTHING_UPLOAD_ENDPOINT: &str = "https://wowthing.org/api/upload/";
#[derive(Serialize)]
struct UploadPayload<'a> {
    #[serde(rename = "apiKey")]
    api_key: &'a str,
    #[serde(rename = "luaFile")]
    lua_file: &'a str,
}

pub(crate) fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())
}

/// Legacy IPC also enters the same queue; it cannot start a concurrent upload.
#[tauri::command]
pub fn submit_addon_data(
    service: tauri::State<'_, crate::sync_service::SyncService>,
    file_path: String,
) -> Result<String, String> {
    service.enqueue_file(file_path)?;
    Ok("Upload queued".into())
}
pub(crate) async fn upload_file(
    app: &tauri::AppHandle,
    client: &reqwest::Client,
    file_path: &str,
) -> Result<String, String> {
    let store = app.store(".settings.dat").map_err(|e| e.to_string())?;
    let api_key_value = store
        .get("api-key")
        .ok_or("Configure your API key in Settings.")?;
    let api_key = api_key_value
        .as_str()
        .filter(|key| !key.trim().is_empty())
        .ok_or("Configure your API key in Settings.")?;
    let lua_contents = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    submit_addon_data_internal(client, WOWTHING_UPLOAD_ENDPOINT, api_key, &lua_contents).await
}
#[derive(Debug)]
pub(crate) struct UploadFailure {
    pub message: String,
    pub retry_after: Option<Duration>,
    pub temporary: bool,
}
fn temporary_transport(
    timeout: bool,
    connect: bool,
    request: bool,
    body: bool,
    builder: bool,
) -> bool {
    !builder && (timeout || connect || request || body)
}
pub(crate) fn temporary_status(status: u16) -> bool {
    (500..=599).contains(&status) || status == 429 || status == 408
}
fn retry_after(value: &str) -> Option<Duration> {
    value
        .parse::<u64>()
        .ok()
        .map(Duration::from_secs)
        .or_else(|| {
            httpdate::parse_http_date(value)
                .ok()?
                .duration_since(std::time::SystemTime::now())
                .ok()
        })
}
pub(crate) async fn retry_upload<F, Fut, S, Sleep>(
    mut request: F,
    mut sleep: S,
) -> Result<String, String>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<String, UploadFailure>>,
    S: FnMut(Duration) -> Sleep,
    Sleep: Future<Output = ()>,
{
    for attempt in 0..3 {
        match request().await {
            Ok(value) => return Ok(value),
            Err(error)
                if error.temporary
                    && attempt < 2
                    && error
                        .retry_after
                        .is_none_or(|delay| delay <= Duration::from_secs(30)) =>
            {
                sleep(
                    error
                        .retry_after
                        .unwrap_or(Duration::from_secs(1 << attempt)),
                )
                .await
            }
            Err(error) => return Err(error.message),
        }
    }
    unreachable!("bounded attempts return")
}
fn upload_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    lua_file: &str,
) -> Result<reqwest::Request, reqwest::Error> {
    client
        .post(endpoint)
        .json(&UploadPayload { api_key, lua_file })
        .header("User-Agent", "WoWthing Sync - Tauri")
        .build()
}
pub(crate) async fn submit_addon_data_internal(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    lua_file: &str,
) -> Result<String, String> {
    retry_upload(
        || async {
            let request =
                upload_request(client, endpoint, api_key, lua_file).map_err(|_| UploadFailure {
                    temporary: false,
                    message: "Invalid upload endpoint".into(),
                    retry_after: None,
                })?;
            let response = client
                .execute(request)
                .await
                .map_err(|error| UploadFailure {
                    temporary: temporary_transport(
                        error.is_timeout(),
                        error.is_connect(),
                        error.is_request(),
                        error.is_body(),
                        error.is_builder(),
                    ),
                    message: "Could not reach WoWthing. Try again later.".into(),
                    retry_after: None,
                })?;
            let status = response.status();
            if status.is_success() {
                // API response bodies may contain user data; do not put them in status/logs.
                Ok("Sync completed".into())
            } else {
                Err(UploadFailure {
                    message: format!(
                        "WoWthing rejected the upload (HTTP {}).{}",
                        status.as_u16(),
                        if status.as_u16() == 401 || status.as_u16() == 403 {
                            " Check your API key in Settings."
                        } else {
                            ""
                        }
                    ),
                    temporary: temporary_status(status.as_u16()),
                    retry_after: response
                        .headers()
                        .get(reqwest::header::RETRY_AFTER)
                        .and_then(|v| v.to_str().ok())
                        .and_then(retry_after),
                })
            }
        },
        tokio::time::sleep,
    )
    .await
}
#[cfg(test)]
mod retry_tests {
    use super::*;
    #[tokio::test]
    async fn retries_temporary_failures_with_bounded_backoff() {
        let mut attempts = 0;
        let mut delays = Vec::new();
        let result = retry_upload(
            || {
                attempts += 1;
                std::future::ready(if attempts == 3 {
                    Ok("ok".into())
                } else {
                    Err(UploadFailure {
                        message: "busy".into(),
                        temporary: true,
                        retry_after: None,
                    })
                })
            },
            |duration| {
                delays.push(duration);
                std::future::ready(())
            },
        )
        .await;
        assert_eq!(result.unwrap(), "ok");
        assert_eq!(attempts, 3);
        assert_eq!(delays, [Duration::from_secs(1), Duration::from_secs(2)]);
    }
    #[tokio::test]
    async fn permanent_failures_are_not_retried_and_temporary_failures_are_bounded() {
        for temporary in [false, true] {
            let mut attempts = 0;
            let result = retry_upload(
                || {
                    attempts += 1;
                    std::future::ready(Err(UploadFailure {
                        message: "failure".into(),
                        temporary,
                        retry_after: Some(Duration::from_secs(2)),
                    }))
                },
                |_| std::future::ready(()),
            )
            .await;
            assert!(result.is_err());
            assert_eq!(attempts, if temporary { 3 } else { 1 });
        }
    }
    #[tokio::test]
    async fn does_not_retry_before_a_long_server_retry_after() {
        let mut attempts = 0;
        let result = retry_upload(
            || {
                attempts += 1;
                std::future::ready(Err(UploadFailure {
                    temporary: true,
                    message: "retry later".into(),
                    retry_after: Some(Duration::from_secs(3600)),
                }))
            },
            |_| async { panic!("must not sleep/retry sooner than requested") },
        )
        .await;
        assert!(result.is_err());
        assert_eq!(attempts, 1);
    }
    #[test]
    fn transport_resets_are_temporary_but_request_build_failures_are_not() {
        assert!(temporary_transport(false, false, true, false, false));
        assert!(temporary_transport(false, false, false, true, false));
        assert!(!temporary_transport(false, false, true, false, true));
        let builder_error =
            upload_request(&reqwest::Client::new(), "http://[", "test", "lua").unwrap_err();
        assert!(!temporary_transport(
            builder_error.is_timeout(),
            builder_error.is_connect(),
            builder_error.is_request(),
            builder_error.is_body(),
            builder_error.is_builder()
        ));
    }
    #[test]
    fn payload_and_http_classification_are_stable() {
        assert_eq!(
            serde_json::to_value(UploadPayload {
                api_key: "test",
                lua_file: "lua"
            })
            .unwrap(),
            serde_json::json!({ "apiKey": "test", "luaFile": "lua" })
        );
        let request = upload_request(
            &reqwest::Client::new(),
            "https://example.invalid/upload/",
            "test",
            "lua",
        )
        .unwrap();
        assert_eq!(request.method(), reqwest::Method::POST);
        assert_eq!(request.url().as_str(), "https://example.invalid/upload/");
        assert_eq!(request.headers()["user-agent"], "WoWthing Sync - Tauri");
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(
                request.body().unwrap().as_bytes().unwrap()
            )
            .unwrap(),
            serde_json::json!({ "apiKey": "test", "luaFile": "lua" })
        );
        for status in [400, 401, 403, 404, 422] {
            assert!(!temporary_status(status));
        }
        for status in [408, 429, 500, 502, 503] {
            assert!(temporary_status(status));
        }
    }
    #[test]
    fn bounds_server_retry_after_and_supports_http_dates() {
        assert_eq!(retry_after("99999"), Some(Duration::from_secs(99999)));
        assert_eq!(retry_after("2"), Some(Duration::from_secs(2)));
        assert!(retry_after(&httpdate::fmt_http_date(
            std::time::SystemTime::now() + Duration::from_secs(5)
        ))
        .is_some());
        assert!(retry_after("garbage").is_none());
    }
}
