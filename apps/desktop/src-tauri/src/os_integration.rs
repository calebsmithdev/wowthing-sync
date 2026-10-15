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
    let seed_legacy = std::env::var("WOWTHING_OS_SEED_LEGACY").as_deref() == Ok("1");
    let autostart = tauri_plugin_autostart::Builder::new().app_name(&unique);
    let autostart = if seed_legacy {
        autostart
    } else {
        autostart.arg(crate::window_lifecycle::AUTOSTART_ARG)
    };
    #[cfg(target_os = "macos")]
    let autostart = autostart.macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent);
    tauri::Builder::default()
        .plugin(autostart.build())
        .setup(move |app| {
            if seed_legacy {
                let manager = app.autolaunch();
                let result = (|| -> Result<(), String> {
                    if manager.is_enabled().map_err(|e| e.to_string())? { return Err("unique legacy identity unexpectedly exists".into()); }
                    manager.enable().map_err(|e| e.to_string())?;
                    if !manager.is_enabled().map_err(|e| e.to_string())? { return Err("legacy registration missing".into()); }
                    verify_autostart_marker(app.handle(), &unique, false)
                })();
                if result.is_err() { let _ = manager.disable(); }
                println!("OS_LEGACY_REPORT {}", serde_json::json!({"passed":result.is_ok(),"error":result.as_ref().err(),"identity":unique}));
                app.handle().exit(if result.is_ok() { 0 } else { 1 });
                return Ok(());
            }
            let cleanup_only = std::env::var("WOWTHING_OS_CLEANUP").as_deref() == Ok("1");
            let credentials = if cleanup_only { crate::credentials::ci_cleanup(&unique) } else { crate::credentials::ci_roundtrip(&unique) };
            let manager = app.autolaunch();
            let autostart = (|| -> Result<(), String> {
                if cleanup_only { return Ok(()); }
                if !manager.is_enabled().map_err(|e| e.to_string())? { return Err("seeded legacy autostart identity missing".into()); }
                verify_autostart_marker(app.handle(), &unique, false)?;
                let marked = std::cell::Cell::new(false);
                crate::settings::refresh_registration(&ScopedStart(app.handle(), &unique), false, || { marked.set(true); Ok(()) })?;
                if !marked.get() { return Err("registration refresh did not complete".into()); }
                verify_autostart_marker(app.handle(), &unique, true)
            })();
            // Always remove our unique identity, even when verification failed.
            let cleanup = manager.disable().map_err(|e| e.to_string()).and_then(|()| {
                if manager.is_enabled().map_err(|e| e.to_string())? { Err("autostart cleanup failed".into()) } else { Ok(()) }
            });
            let passed = credentials.is_ok() && autostart.is_ok() && cleanup.is_ok();
            println!("OS_INTEGRATION_REPORT {}", serde_json::json!({"passed":passed,"marker":"WOWTHING_OS_CI_V1","credentials":credentials.err(),"autostartRefresh":autostart.is_ok(),"autostart":autostart.err(),"cleanup":cleanup.err(),"identity":unique}));
            app.handle().exit(if passed { 0 } else { 1 });
            Ok(())
        })
        .run(context).expect("isolated OS probe failed");
}

// Inspect only this probe's unique artifact. This proves registration contents,
// not argument delivery by the OS during a real login.
fn verify_autostart_marker(
    app: &tauri::AppHandle,
    unique: &str,
    expected: bool,
) -> Result<(), String> {
    const ARG: &str = crate::window_lifecycle::AUTOSTART_ARG;
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    let contents = {
        use tauri::Manager;
        let home = app.path().home_dir().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        let path = home
            .join("Library/LaunchAgents")
            .join(format!("{unique}.plist"));
        #[cfg(target_os = "linux")]
        let path = home
            .join(".config/autostart")
            .join(format!("{unique}.desktop"));
        std::fs::read_to_string(path).map_err(|e| e.to_string())?
    };
    #[cfg(target_os = "macos")]
    let present = contents
        .split_once("<key>ProgramArguments</key>")
        .and_then(|(_, tail)| tail.split_once("</array>"))
        .is_some_and(|(args, _)| args.contains(&format!("<string>{ARG}</string>")));
    #[cfg(target_os = "linux")]
    let present = contents
        .lines()
        .find_map(|line| line.strip_prefix("Exec="))
        .is_some_and(|command| command.split_whitespace().last() == Some(ARG));
    #[cfg(windows)]
    let present = {
        let _ = app;
        // auto-launch's Dynamic mode tries HKLM first, then HKCU on access denial.
        let mut present = false;
        for hive in ["HKLM", "HKCU"] {
            let key = format!(r"{hive}\Software\Microsoft\Windows\CurrentVersion\Run");
            let output = std::process::Command::new("reg.exe")
                .args(["query", &key, "/v", unique])
                .output()
                .map_err(|e| e.to_string())?;
            if output.status.success() {
                present |= String::from_utf8_lossy(&output.stdout).lines().any(|line| {
                    line.contains("REG_SZ") && line.split_whitespace().last() == Some(ARG)
                });
            }
        }
        present
    };
    if present != expected {
        return Err("Autostart registration login marker did not match expected state".into());
    }
    Ok(())
}

// Production refresh algorithm/preflight, scoped to this hosted-only identity.
struct ScopedStart<'a>(&'a tauri::AppHandle, &'a str);
impl crate::settings::AutoStart for ScopedStart<'_> {
    fn prepare_refresh(&self) -> Result<(), String> {
        crate::login_registration::prepare(self.0, self.1)
    }
    fn actual(&self) -> Result<bool, String> {
        self.0.autolaunch().is_enabled().map_err(|e| e.to_string())
    }
    fn set(&self, enabled: bool) -> Result<(), String> {
        if !enabled {
            return Err("refresh must never disable".into());
        }
        self.0.autolaunch().enable().map_err(|e| e.to_string())
    }
}
