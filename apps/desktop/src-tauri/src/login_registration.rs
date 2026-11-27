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
    inspect_linux_registration(&linux_registration_path(app, name)?)?;
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

#[cfg(target_os = "linux")]
fn linux_registration_path(
    app: &tauri::AppHandle,
    name: &str,
) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let home = app
        .path()
        .home_dir()
        .map_err(|_| "Home directory unavailable")?;
    // auto-launch 0.6.0 deliberately uses this location, not XDG_CONFIG_HOME.
    // The name comes only from package metadata or the scoped hosted probe.
    Ok(home
        .join(".config/autostart")
        .join(format!("{name}.desktop")))
}

/// The path tauri-plugin-autostart 2.7.0 registers: `$APPIMAGE` when set,
/// otherwise the current executable. Only the hosted probe compares against it;
/// the rewrite quotes whatever path the plugin resolved at setup.
#[cfg(all(target_os = "linux", feature = "os-integration-test"))]
pub(crate) fn linux_launch_path(app: &tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    if let Some(appimage) = app
        .env()
        .appimage
        .and_then(|p| p.to_str().map(String::from))
    {
        return Ok(appimage);
    }
    std::env::current_exe()
        .map(|path| path.display().to_string())
        .map_err(|_| "Could not resolve executable for launch at login".into())
}

/// auto-launch 0.6.0 writes `Exec=<path> <args>` without quoting, so the
/// deb/rpm binary `/usr/bin/Wowthing Sync` splits into `/usr/bin/Wowthing`.
/// Call right after `enable()`: rewrite only that generated line.
#[cfg(target_os = "linux")]
pub(crate) fn quote_linux_registration(
    app: &tauri::AppHandle,
    name: &str,
    args: &[&str],
) -> Result<(), String> {
    let path = linux_registration_path(app, name)?;
    let contents = read_registration(&path)
        .map_err(|_| "Could not read the new launch-at-login entry".to_string())?;
    let Some(fixed) = quoted_registration(&contents, args)? else {
        return Ok(());
    };
    let temp = path.with_extension("desktop.tmp");
    let write = || -> std::io::Result<()> {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        match std::fs::remove_file(&temp) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&temp)?;
        file.write_all(fixed.as_bytes())?;
        std::fs::rename(&temp, &path)
    };
    write().map_err(|_| {
        let _ = std::fs::remove_file(&temp);
        "Could not write the launch-at-login entry".to_string()
    })
}

/// Returns the entry with its single generated `Exec=<path> <args>` line quoted,
/// `None` when it is already quoted, and an error for any other `Exec` contents.
/// The path is taken from the line itself: the plugin resolved it once at setup,
/// and `current_exe()` can differ later (e.g. "(deleted)" after a package upgrade).
#[cfg(any(test, target_os = "linux"))]
fn quoted_registration(contents: &str, args: &[&str]) -> Result<Option<String>, String> {
    let unexpected = || "Unexpected launch-at-login entry".to_string();
    let mut exec = contents.lines().filter(|line| line.starts_with("Exec="));
    let (Some(line), None) = (exec.next(), exec.next()) else {
        return Err(unexpected());
    };
    let value = &line["Exec=".len()..];
    if value.starts_with('"') {
        return Ok(None);
    }
    let args = args.join(" ");
    let exe = value
        .strip_suffix(&format!(" {args}"))
        .filter(|exe| exe.starts_with('/'))
        .ok_or_else(unexpected)?;
    let quoted = format!("{} {args}", quote_exec_arg(exe)?);
    let quoted = quoted.trim_end();
    Ok(Some(
        contents
            .lines()
            .map(|l| {
                if l == line {
                    format!("Exec={quoted}")
                } else {
                    l.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
            + "\n",
    ))
}

/// Quote one Exec argument per the Desktop Entry spec: reserved characters are
/// backslash-escaped inside double quotes, `%` is doubled, and the string-value
/// escape (`\\` for a backslash) is applied on top.
#[cfg(any(test, target_os = "linux"))]
fn quote_exec_arg(arg: &str) -> Result<String, String> {
    if arg.is_empty() || arg.chars().any(char::is_control) {
        return Err("Executable path cannot be registered for launch at login".into());
    }
    let mut out = String::from("\"");
    // Each arm pushes the escape prefix; `c` itself completes the sequence.
    for c in arg.chars() {
        match c {
            '"' | '`' | '$' => out.push_str("\\\\"),
            '\\' => out.push_str("\\\\\\"),
            '%' => out.push('%'),
            _ => {}
        }
        out.push(c);
    }
    out.push('"');
    Ok(out)
}

/// Split an Exec value into arguments (string unescape, then quoting, then `%%`).
/// Field codes other than `%%` are not expected in our entries and are rejected.
#[cfg(any(test, all(target_os = "linux", feature = "os-integration-test")))]
pub(crate) fn parse_exec(value: &str) -> Result<Vec<String>, String> {
    let mut unescaped = String::new();
    let mut chars = value.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            unescaped.push(c);
            continue;
        }
        match chars.next() {
            Some('s') => unescaped.push(' '),
            Some('\\') => unescaped.push('\\'),
            // Keep other escapes for the quoting stage.
            Some(other) => {
                unescaped.push('\\');
                unescaped.push(other);
            }
            None => return Err("Trailing escape".into()),
        }
    }
    let mut args = Vec::new();
    let mut chars = unescaped.chars().peekable();
    loop {
        while chars.next_if_eq(&' ').is_some() {}
        if chars.peek().is_none() {
            return Ok(args);
        }
        let mut arg = String::new();
        if chars.next_if_eq(&'"').is_some() {
            loop {
                match chars.next() {
                    Some('"') => break,
                    Some('\\') => match chars.next() {
                        Some(c @ ('"' | '`' | '$' | '\\')) => arg.push(c),
                        _ => return Err("Invalid escape in quoted argument".into()),
                    },
                    Some(c) => arg.push(c),
                    None => return Err("Unterminated quoted argument".into()),
                }
            }
            if chars.peek().is_some_and(|c| *c != ' ') {
                return Err("Quoted argument must end at a space".into());
            }
        } else {
            while let Some(c) = chars.next_if(|c| *c != ' ') {
                if matches!(c, '"' | '`' | '$' | '\\') {
                    return Err("Reserved character outside quotes".into());
                }
                arg.push(c);
            }
        }
        let mut decoded = String::new();
        let mut parts = arg.chars();
        while let Some(c) = parts.next() {
            if c == '%' && parts.next() != Some('%') {
                return Err("Unsupported field code".into());
            }
            decoded.push(c);
        }
        args.push(decoded);
    }
}

#[cfg(any(test, target_os = "linux"))]
fn read_registration(path: &std::path::Path) -> std::io::Result<String> {
    use std::io::Read;
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
}

#[cfg(any(test, target_os = "linux"))]
fn inspect_linux_registration(path: &std::path::Path) -> Result<(), String> {
    let contents = read_registration(path)
        .map_err(|_| "Could not safely read launch-at-login entry; refresh deferred")?;
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

    // auto-launch 0.6.0 output for the deb/rpm binary, which has a space.
    const DEB_EXE: &str = "/usr/bin/Wowthing Sync";
    const GENERATED: &str = "[Desktop Entry]\nType=Application\nVersion=1.0\nName=wowthing-sync\nComment=wowthing-sync startup script\nExec=/usr/bin/Wowthing Sync --autostart\nStartupNotify=false\nTerminal=false";

    #[test]
    fn unquoted_generated_exec_runs_the_wrong_program() {
        let exec = GENERATED
            .lines()
            .find_map(|l| l.strip_prefix("Exec="))
            .unwrap();
        assert_eq!(
            parse_exec(exec).unwrap(),
            ["/usr/bin/Wowthing", "Sync", "--autostart"]
        );
    }

    #[test]
    fn linux_generated_entry_is_quoted_once_and_still_refreshable() {
        let fixed = quoted_registration(GENERATED, &["--autostart"])
            .unwrap()
            .unwrap();
        assert!(fixed.contains("\nExec=\"/usr/bin/Wowthing Sync\" --autostart\n"));
        assert_eq!(
            fixed.replace(
                "Exec=\"/usr/bin/Wowthing Sync\"",
                "Exec=/usr/bin/Wowthing Sync"
            ),
            format!("{GENERATED}\n")
        );
        let exec = fixed.lines().find_map(|l| l.strip_prefix("Exec=")).unwrap();
        assert_eq!(parse_exec(exec).unwrap(), [DEB_EXE, "--autostart"]);
        assert_eq!(quoted_registration(&fixed, &["--autostart"]), Ok(None));
        // The next automatic refresh must accept the corrected entry.
        assert!(plain_linux_registration(&fixed));
    }

    #[test]
    fn linux_quoting_round_trips_reserved_characters() {
        for exe in [
            "/opt/plain",
            "/home/a b/My Apps/Wowthing Sync.AppImage",
            "/opt/q\"uote/$HOME/`tick`/back\\slash/100%/s;emi=ok/ünï",
        ] {
            let quoted = quote_exec_arg(exe).unwrap();
            assert_eq!(
                parse_exec(&format!("{quoted} --autostart")).unwrap(),
                [exe, "--autostart"]
            );
        }
        assert_eq!(quote_exec_arg("/a\\b").unwrap(), "\"/a\\\\\\\\b\"");
        assert_eq!(quote_exec_arg("/a\"b%").unwrap(), "\"/a\\\\\"b%%\"");
        for exe in ["", "/opt/new\nline", "/opt/tab\t"] {
            assert!(quote_exec_arg(exe).is_err(), "{exe:?}");
        }
    }

    #[test]
    fn linux_quoting_rejects_unexpected_exec_lines() {
        let legacy = GENERATED.replace(" --autostart", " ");
        assert_eq!(
            quoted_registration(&legacy, &[])
                .unwrap()
                .unwrap()
                .lines()
                .nth(5),
            Some("Exec=\"/usr/bin/Wowthing Sync\"")
        );
        for contents in [
            GENERATED.replace(" --autostart", " --other"),
            GENERATED.replace("Exec=/usr/bin/", "Exec=usr/bin/"),
            GENERATED.replace("Exec=", "X-Exec="),
            format!("{GENERATED}\nExec=/usr/bin/Wowthing Sync --autostart"),
        ] {
            assert!(quoted_registration(&contents, &["--autostart"]).is_err());
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
