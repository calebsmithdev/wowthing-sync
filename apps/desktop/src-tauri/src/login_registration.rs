//! Conservative preflight for the one-time automatic registration rewrite.
//! Explicit Settings toggles retain their existing behavior and rollback policy.

pub(crate) fn prepare(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe()
            .and_then(|path| path.canonicalize())
            .map_err(|_| "Could not resolve executable for registration refresh")?;
        if transient_macos_executable(&exe) {
            return Err(
                "Registration refresh deferred until running from an installed location".into(),
            );
        }
    }
    #[cfg(target_os = "linux")]
    {
        use tauri::Manager;
        let home = app
            .path()
            .home_dir()
            .map_err(|_| "Home directory unavailable")?;
        // auto-launch 0.6.0 deliberately uses this location, not XDG_CONFIG_HOME.
        // The name comes only from package metadata or the scoped hosted probe.
        inspect_linux_registration(
            &home
                .join(".config/autostart")
                .join(format!("{name}.desktop")),
        )?;
    }
    let _ = (app, name);
    Ok(())
}

#[cfg(any(test, target_os = "macos"))]
fn transient_macos_executable(path: &std::path::Path) -> bool {
    path.starts_with("/Volumes")
        || path
            .components()
            .any(|part| part.as_os_str() == "AppTranslocation")
}

#[cfg(any(test, target_os = "linux"))]
fn inspect_linux_registration(path: &std::path::Path) -> Result<(), String> {
    use std::io::Read;
    let read = || -> std::io::Result<String> {
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options.open(path)?;
        if !file.metadata()?.is_file() {
            return Err(std::io::Error::other("registration is not a regular file"));
        }
        let mut contents = String::new();
        file.take(65537).read_to_string(&mut contents)?;
        if contents.len() > 65536 {
            return Err(std::io::Error::other("registration is too large"));
        }
        Ok(contents)
    };
    let contents =
        read().map_err(|_| "Could not safely read launch-at-login entry; refresh deferred")?;
    if !plain_linux_registration(&contents) {
        return Err("Customized or disabled launch-at-login entry; refresh deferred".into());
    }
    Ok(())
}

// Recognize the plugin's small generated format, plus explicit enabled flags.
// This is a rewrite eligibility check, not a general desktop-entry parser.
// Unknown keys/groups, ambiguous duplicates, OnlyShowIn/NotShowIn/TryExec and
// desktop-specific conditions defer rather than erase an external restriction.
#[cfg(any(test, target_os = "linux"))]
fn plain_linux_registration(contents: &str) -> bool {
    let mut group = false;
    let mut keys = std::collections::HashSet::new();
    for line in contents.lines().map(str::trim) {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if line == "[Desktop Entry]" && !group {
            group = true;
            continue;
        }
        if !group {
            return false;
        }
        let Some((key, value)) = line.split_once('=') else {
            return false;
        };
        let key = key.trim();
        let value = value.trim();
        if !keys.insert(key) {
            return false;
        }
        let accepted = match key {
            "Type" => value == "Application",
            "Version" | "Name" | "Comment" | "Exec" => !value.is_empty(),
            "StartupNotify" | "Terminal" | "Hidden" => value == "false",
            "X-GNOME-Autostart-enabled" => value == "true",
            _ => false,
        };
        if !accepted {
            return false;
        }
    }
    group
        && ["Type", "Name", "Exec"]
            .iter()
            .all(|key| keys.contains(key))
}

#[cfg(test)]
mod tests {
    use super::*;
    const ENTRY: &str = "[Desktop Entry]\nType=Application\nVersion=1.0\nName=Test\nComment=Test startup script\nExec=/opt/test\nStartupNotify=false\nTerminal=false\n";

    #[test]
    fn transient_macos_locations_defer_without_matching_similar_names() {
        for path in [
            "/Volumes/Installer/Test.app/Contents/MacOS/Test",
            "/private/var/folders/x/AppTranslocation/id/d/Test.app/Contents/MacOS/Test",
        ] {
            assert!(transient_macos_executable(std::path::Path::new(path)));
        }
        for path in [
            "/Applications/Test.app/Contents/MacOS/Test",
            "/Users/test/Applications/Test.app/Contents/MacOS/Test",
            "/VolumesOther/Test",
            "/Applications/AppTranslocationTool.app/Contents/MacOS/Test",
        ] {
            assert!(!transient_macos_executable(std::path::Path::new(path)));
        }
    }

    #[test]
    fn linux_refresh_preserves_external_disabling_and_conditions() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.desktop");
        for suffix in ["", "Hidden=false\nX-GNOME-Autostart-enabled=true\n"] {
            std::fs::write(&path, format!("{ENTRY}{suffix}")).unwrap();
            inspect_linux_registration(&path).unwrap();
        }
        for suffix in [
            "Hidden=true",
            "X-GNOME-Autostart-enabled=false",
            "Hidden=unknown",
            "OnlyShowIn=GNOME;",
            "NotShowIn=KDE;",
            "TryExec=/missing",
            "X-KDE-autostart-condition=test",
            "[Other Group]\nHidden=false",
            "Hidden=false\nHidden=true",
            "malformed",
        ] {
            let contents = format!("{ENTRY}{suffix}\n");
            std::fs::write(&path, &contents).unwrap();
            assert!(inspect_linux_registration(&path).is_err(), "{suffix}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        }
    }

    #[test]
    fn linux_unknown_or_unreadable_entries_defer() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.desktop");
        assert!(inspect_linux_registration(&path).is_err());
        assert!(inspect_linux_registration(temp.path()).is_err());
        for contents in [vec![0xff], vec![b'a'; 65537], b"# empty entry".to_vec()] {
            std::fs::write(&path, contents).unwrap();
            assert!(inspect_linux_registration(&path).is_err());
        }
        #[cfg(unix)]
        {
            std::fs::remove_file(&path).unwrap();
            std::os::unix::fs::symlink(temp.path().join("missing"), &path).unwrap();
            assert!(inspect_linux_registration(&path).is_err());
        }
    }
}
