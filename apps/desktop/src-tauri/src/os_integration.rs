//! Opt-in hosted-runner-only OS probes. Never initialized by the normal app.
use tauri_plugin_autostart::ManagerExt;

pub fn run() {
    if std::env::var("WOWTHING_OS_TESTS").as_deref() != Ok("1")
        || std::env::var("GITHUB_ACTIONS").as_deref() != Ok("true")
        || std::env::var("RUNNER_ENVIRONMENT").as_deref() != Ok("github-hosted")
    {
        eprintln!("Real OS probes require explicit disposable GitHub-hosted runner opt-in");
        std::process::exit(2);
    }
    let unique = std::env::var("WOWTHING_OS_ID").expect("scoped OS probe identity required");
    assert!(
        unique.starts_with("wowthing-ci-")
            && unique.len() < 100
            && unique
                .bytes()
                .all(|v| v.is_ascii_lowercase() || v.is_ascii_digit() || v == b'-')
    );
    if std::env::var("WOWTHING_EXPECT_VAULT_UNAVAILABLE").as_deref() == Ok("1") {
        let passed = crate::credentials::ci_unavailable(&unique).is_ok();
        println!(
            "OS_INTEGRATION_REPORT {}",
            serde_json::json!({"passed":passed,"probe":"unavailable-vault","marker":"WOWTHING_OS_CI_V1"})
        );
        std::process::exit(if passed { 0 } else { 1 });
    }
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().identifier = format!("com.calebsmithdev.{unique}");
    let autostart = tauri_plugin_autostart::Builder::new().app_name(&unique);
    #[cfg(target_os = "macos")]
    let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    tauri::Builder::default()
        .plugin(autostart.build())
        .setup(move |app| {
            let cleanup_only = std::env::var("WOWTHING_OS_CLEANUP").as_deref() == Ok("1");
            let credentials = if cleanup_only { crate::credentials::ci_cleanup(&unique) } else { crate::credentials::ci_roundtrip(&unique) };
            let manager = app.autolaunch();
            let autostart = (|| -> Result<(), String> {
                if cleanup_only { return Ok(()); }
                if manager.is_enabled().map_err(|e| e.to_string())? { return Err("unique autostart identity unexpectedly exists".into()); }
                manager.enable().map_err(|e| e.to_string())?;
                if !manager.is_enabled().map_err(|e| e.to_string())? { return Err("autostart registration not observable".into()); }
                Ok(())
            })();
            // Always remove our unique identity, even when verification failed.
            let cleanup = manager.disable().map_err(|e| e.to_string()).and_then(|()| {
                if manager.is_enabled().map_err(|e| e.to_string())? { Err("autostart cleanup failed".into()) } else { Ok(()) }
            });
            let passed = credentials.is_ok() && autostart.is_ok() && cleanup.is_ok();
            println!("OS_INTEGRATION_REPORT {}", serde_json::json!({"passed":passed,"marker":"WOWTHING_OS_CI_V1","credentials":credentials.err(),"autostart":autostart.err(),"cleanup":cleanup.err(),"identity":unique}));
            app.handle().exit(if passed { 0 } else { 1 });
            Ok(())
        })
        .run(context).expect("isolated OS probe failed");
}
