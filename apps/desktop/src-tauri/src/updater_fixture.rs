//! Actual updater adapter, reachable only in the compiled isolated integration harness.
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;
const MARKER: &str = "WOWTHING_UPDATER_CI_V1";
#[tauri::command]
pub async fn updater_fixture(app: tauri::AppHandle) -> Result<(), String> {
    let root = crate::integration::root();
    for attempt in 0..150 {
        let status = app.state::<crate::sync_service::SyncService>().snapshot();
        if status.last_success.is_some()
            && status.pending == 0
            && !status.is_processing
            && status.failures.is_empty()
        {
            break;
        }
        if attempt == 149 {
            return Err("real worker did not complete before update".into());
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let version = app.package_info().version.to_string();
    if version == "1.0.8" {
        let status = app.state::<crate::sync_service::SyncService>().snapshot();
        let report = serde_json::json!({"marker":MARKER,"version":version,"passed":true,"lastSuccess":status.last_success});
        std::fs::write(root.join("updater-candidate.json"), report.to_string())
            .map_err(|e| e.to_string())?;
        println!("UPDATER_REPORT {report}");
        app.exit(0);
        return Ok(());
    }
    if version != "1.0.6" {
        return Err(format!("unexpected installed version {version}"));
    }
    let base = std::env::var("WOWTHING_UPDATER_ENDPOINT").map_err(|e| e.to_string())?;
    let url = reqwest::Url::parse(&base).map_err(|e| e.to_string())?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("updater endpoint must be loopback".into());
    }
    for invalid in [true, false] {
        let endpoint = url
            .join(if invalid { "invalid" } else { "valid" })
            .map_err(|e| e.to_string())?;
        let callback_root = root.clone();
        let updater = app
            .updater_builder()
            .endpoints(vec![endpoint])
            .map_err(|e| e.to_string())?
            .no_proxy()
            .timeout(std::time::Duration::from_secs(30))
            .configure_client(|client| client.redirect(reqwest::redirect::Policy::none()))
            .restart_after_install(false)
            .on_before_exit(move || {
                let _ = std::fs::write(callback_root.join("updater-install-started"), "1.0.6");
            })
            .build()
            .map_err(|e| e.to_string())?;
        let update = updater
            .check()
            .await
            .map_err(|e| e.to_string())?
            .ok_or("missing candidate update")?;
        if update.version != "1.0.8" || update.current_version != "1.0.6" {
            return Err("updater version comparison failed".into());
        }
        // Real plugin signature verification runs before any platform installation.
        let bytes = update.download(|_, _| {}, || {}).await;
        if invalid {
            if !matches!(
                bytes,
                Err(tauri_plugin_updater::Error::Minisign(
                    minisign_verify::Error::InvalidSignature
                ))
            ) {
                return Err("expected real cryptographic signature rejection".into());
            }
            std::fs::write(root.join("updater-signature-rejected"), "1.0.6")
                .map_err(|e| e.to_string())?;
        } else {
            update
                .install(bytes.map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        }
    }
    app.exit(0);
    Ok(())
}
