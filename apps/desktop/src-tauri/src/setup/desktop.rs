use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::MacosLauncher;

pub const AUTOSTART_ARG: &str = "--autostart";

fn launched_at_login(args: impl IntoIterator<Item = String>) -> bool {
    args.into_iter().skip(1).any(|arg| arg == AUTOSTART_ARG)
}

pub fn setup_desktop(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(desktop)]
    {
        app.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))?;
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
        let _ = app.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            crate::window_lifecycle::on_second_instance(app, &args);
        }));

        if !launched_at_login(std::env::args()) {
            let main_window = app.get_webview_window("main").expect("no main window");
            main_window.show()?;
            main_window.set_focus()?;
        }
    }

    #[cfg(not(desktop))]
    let _ = app; // Prevent unused variable warning on non-macOS platforms

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_marker_requires_an_exact_argument_after_the_executable() {
        for args in [
            vec!["app", AUTOSTART_ARG],
            vec!["app", "other", AUTOSTART_ARG],
        ] {
            assert!(launched_at_login(args.into_iter().map(String::from)));
        }
        for args in [
            vec![],
            vec!["app"],
            vec![AUTOSTART_ARG],
            vec![AUTOSTART_ARG, "other"],
            vec!["app", "--autostart=1"],
            vec!["app", "prefix--autostart"],
            vec!["app", "--autostart "],
        ] {
            assert!(!launched_at_login(args.into_iter().map(String::from)));
        }
    }
}
