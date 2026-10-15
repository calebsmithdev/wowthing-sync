//! All collector reads are relative to a held directory capability. Canonicalization
//! alone is insufficient: a symlink could be swapped between checking and opening.
use cap_std::fs::Dir;
use std::{
    io::Read,
    path::{Component, Path, PathBuf},
};

pub const MAX_COLLECTOR_BYTES: u64 = 32 * 1024 * 1024;
const COLLECTOR: &str = "WoWthing_Collector.lua";
pub type ScanFailures = Vec<(PathBuf, String)>;
pub type ScanResult = (Vec<PathBuf>, ScanFailures);

/// One spelling for display, persisted history and validated queue entries.
/// This does not authorize a path: validate the original input before calling it.
pub fn display_path(path: &Path) -> PathBuf {
    let path = dunce::simplified(path);
    #[cfg(windows)]
    {
        use std::os::windows::ffi::{OsStrExt, OsStringExt};
        // A verbatim path that dunce cannot simplify may treat '/' literally.
        if !matches!(path.components().next(), Some(Component::Prefix(prefix)) if prefix.kind().is_verbatim())
        {
            let spelling: Vec<_> = path
                .as_os_str()
                .encode_wide()
                .map(|unit| {
                    if unit == b'/' as u16 {
                        b'\\' as u16
                    } else {
                        unit
                    }
                })
                .collect();
            return std::ffi::OsString::from_wide(&spelling).into();
        }
    }
    path.to_path_buf()
}

pub struct ApprovedRoot {
    path: PathBuf,
    canonical: PathBuf,
    dir: Dir,
}
impl ApprovedRoot {
    pub fn open(path: &Path) -> Result<Self, String> {
        let canonical = path.canonicalize().map_err(|_| {
            "The selected WoW folder is unavailable. Choose it again in Settings.".to_string()
        })?;
        let dir = Dir::open_ambient_dir(&canonical, cap_std::ambient_authority())
            .map_err(|_| "Cannot open selected WoW folder".to_string())?;
        dir.open_dir("WTF/Account")
            .map_err(|_| "Choose the _retail_ folder containing WTF/Account.".to_string())?;
        Ok(Self {
            path: display_path(&canonical),
            canonical,
            dir,
        })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn accounts_path(&self) -> PathBuf {
        display_path(&self.canonical.join("WTF").join("Account"))
    }
    fn relative(&self, path: &Path) -> Result<PathBuf, String> {
        let relative = path
            .strip_prefix(&self.path)
            // Older clients may still submit the canonical Windows verbatim path.
            // Both spellings resolve only through the held directory capability.
            .or_else(|_| path.strip_prefix(&self.canonical))
            .map_err(|_| "Collector must be inside the selected WoW folder".to_string())?;
        let parts: Vec<_> = relative.components().collect();
        if parts.len() != 5
            || parts[0] != Component::Normal("WTF".as_ref())
            || parts[1] != Component::Normal("Account".as_ref())
            || !matches!(parts[2], Component::Normal(_))
            || parts[3] != Component::Normal("SavedVariables".as_ref())
            || parts[4] != Component::Normal(COLLECTOR.as_ref())
        {
            return Err(
                "Only account SavedVariables/WoWthing_Collector.lua files may be uploaded".into(),
            );
        }
        Ok(relative.to_owned())
    }
    pub fn discover(&self) -> Result<Vec<PathBuf>, String> {
        let (files, failures) = self.scan()?;
        if files.is_empty() {
            if let Some((_, error)) = failures.into_iter().next() {
                return Err(error);
            }
        }
        Ok(files)
    }
    /// Account-directory failures are global; individual collector failures are isolated.
    pub fn scan(&self) -> Result<ScanResult, String> {
        let accounts = self
            .dir
            .read_dir("WTF/Account")
            .map_err(|_| "Cannot read WoW account directory".to_string())?;
        let mut files = Vec::new();
        let mut failures = Vec::new();
        for (count, account) in accounts.enumerate() {
            if count >= 1000 {
                return Err("WoW account directory contains too many entries".into());
            }
            let account = account.map_err(|_| "Cannot read WoW account entry".to_string())?;
            if !account
                .file_type()
                .map_err(|_| "Cannot inspect WoW account entry".to_string())?
                .is_dir()
            {
                continue;
            }
            let relative = Path::new("WTF")
                .join("Account")
                .join(account.file_name())
                .join("SavedVariables")
                .join(COLLECTOR);
            let file = display_path(&self.canonical.join(&relative));
            match self.dir.metadata(&relative) {
                Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_COLLECTOR_BYTES => files.push(file),
                Ok(_) => failures.push((file, "Collector must be a regular file of at most 32 MiB".into())),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
                Err(_) => failures.push((file, "Cannot access collector safely. Check permissions and remove links outside the selected folder.".into())),
            }
        }
        files.sort();
        Ok((files, failures))
    }
    pub fn metadata(&self, path: &Path) -> Result<cap_std::fs::Metadata, String> {
        self.dir
            .metadata(self.relative(path)?)
            .map_err(|_| "Cannot inspect collector safely".into())
    }
    pub fn read(&self, path: &Path) -> Result<Vec<u8>, String> {
        let mut options = cap_std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NONBLOCK);
        }
        let file = self
            .dir
            .open_with(self.relative(path)?, &options)
            .map_err(|_| "Cannot open collector safely within selected folder".to_string())?;
        let metadata = file
            .metadata()
            .map_err(|_| "Cannot inspect opened collector".to_string())?;
        if !metadata.is_file() || metadata.len() > MAX_COLLECTOR_BYTES {
            return Err("Collector must be a regular file of at most 32 MiB".into());
        }
        let mut contents = Vec::new();
        file.take(MAX_COLLECTOR_BYTES + 1)
            .read_to_end(&mut contents)
            .map_err(|_| "Cannot read collector".to_string())?;
        if contents.is_empty() || contents.len() as u64 > MAX_COLLECTOR_BYTES {
            return Err("Collector must be nonempty and at most 32 MiB".into());
        }
        Ok(contents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    fn windows_display_paths_unify_separators_without_resolving_components() {
        let root = Path::new(r"C:\WoW");
        // Pin the string distinction that Path equality hides on Windows.
        assert_eq!(
            root.join("WTF/Account").to_str().unwrap(),
            r"C:\WoW\WTF/Account"
        );
        assert_eq!(
            Path::new(r"\\?\C:\WoW")
                .join("WTF/Account")
                .to_str()
                .unwrap(),
            r"\\?\C:\WoW\WTF\Account"
        );
        for (input, expected) in [
            (r"C:\WoW\WTF/Account", r"C:\WoW\WTF\Account"),
            (r"C:/WoW/WTF/Account", r"C:\WoW\WTF\Account"),
            (r"\\?\C:\WoW\WTF\Account", r"C:\WoW\WTF\Account"),
            (
                r"\\server\share\WoW/WTF/Account",
                r"\\server\share\WoW\WTF\Account",
            ),
            (
                r"C:\WoW\WTF/Account/../Account",
                r"C:\WoW\WTF\Account\..\Account",
            ),
        ] {
            assert_eq!(display_path(Path::new(input)).as_os_str(), expected);
        }
    }
    #[cfg(windows)]
    #[test]
    fn unsafe_verbatim_display_paths_remain_byte_for_byte_unchanged() {
        let long = format!(r"\\?\C:\{}", "long".repeat(70));
        for input in [
            r"\\?\C:\WoW\NUL\collector.lua",
            r"\\?\C:\WoW\trailing.\collector.lua",
            r"\\?\C:\WoW\WTF/Account\collector.lua",
            r"\\?\C:\WoW\..\collector.lua",
            r"\\?\UNC\server\share\WoW\collector.lua",
            long.as_str(),
        ] {
            assert_eq!(display_path(Path::new(input)).as_os_str(), input);
        }
    }
    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("wowthing-fs-{name}-{}", std::process::id()));
        let file = root.join("WTF/Account/TEST/SavedVariables/WoWthing_Collector.lua");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "test lua").unwrap();
        let root = root.canonicalize().unwrap();
        let file = root.join("WTF/Account/TEST/SavedVariables/WoWthing_Collector.lua");
        (root, file)
    }
    #[test]
    fn contains_and_bounds_uploads() {
        let (root, file) = fixture("bounds");
        let approved = ApprovedRoot::open(&root).unwrap();
        assert_eq!(approved.read(&file).unwrap(), b"test lua");
        assert!(approved
            .read(Path::new("/outside/WoWthing_Collector.lua"))
            .is_err());
        assert!(approved
            .read(&root.join("WTF/Account/TEST/SavedVariables/../WoWthing_Collector.lua"))
            .is_err());
        assert!(approved.read(&file.with_file_name("Other.lua")).is_err());
        std::fs::File::create(&file)
            .unwrap()
            .set_len(MAX_COLLECTOR_BYTES + 1)
            .unwrap();
        assert!(approved.read(&file).is_err());
        drop(approved); // Windows keeps the directory open for the capability's lifetime.
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_fifo_replacement_without_blocking() {
        let (root, file) = fixture("fifo");
        let approved = ApprovedRoot::open(&root).unwrap();
        std::fs::remove_file(&file).unwrap();
        let fifo = std::ffi::CString::new(file.to_str().unwrap()).unwrap();
        // SAFETY: a valid NUL-terminated fixture path is passed; no user paths.
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = sender.send(approved.read(&file));
        });
        assert!(receiver
            .recv_timeout(std::time::Duration::from_secs(2))
            .expect("FIFO read must never block the worker")
            .is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn rejects_file_and_directory_symlink_escapes() {
        let (root, file) = fixture("links");
        let outside = root.with_extension("outside");
        std::fs::write(&outside, "must not read").unwrap();
        let approved = ApprovedRoot::open(&root).unwrap();
        std::fs::remove_file(&file).unwrap();
        std::os::unix::fs::symlink(&outside, &file).unwrap();
        assert!(approved.read(&file).is_err());
        assert!(approved.discover().is_err());
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_dir(file.parent().unwrap()).unwrap();
        std::os::unix::fs::symlink(std::env::temp_dir(), file.parent().unwrap()).unwrap();
        assert!(approved.read(&file).is_err());
        std::fs::remove_dir_all(root).unwrap();
        std::fs::remove_file(outside).unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn rejects_windows_file_and_directory_reparse_escapes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("WoW 雪 with spaces");
        let file = root.join("WTF/Account/SYNTHETIC/SavedVariables/WoWthing_Collector.lua");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&file, "synthetic").unwrap();
        let approved = ApprovedRoot::open(&root).unwrap();
        let expected = format!(
            r"{}\WTF\Account\SYNTHETIC\SavedVariables\WoWthing_Collector.lua",
            approved.path().display()
        );
        let file = PathBuf::from(&expected);
        assert!(!approved.path().to_string_lossy().starts_with(r"\\?\"));
        assert_eq!(
            approved.accounts_path().to_str().unwrap(),
            format!(r"{}\WTF\Account", approved.path().display())
        );
        assert_eq!(approved.discover().unwrap()[0].to_str().unwrap(), expected);
        assert_eq!(approved.read(&file).unwrap(), b"synthetic");
        assert_eq!(
            approved.read(&file.canonicalize().unwrap()).unwrap(),
            b"synthetic"
        );
        assert!(approved
            .read(
                &approved
                    .canonical
                    .join("WTF/Account/SYNTHETIC/SavedVariables/../WoWthing_Collector.lua")
            )
            .is_err());
        let outside = temp.path().join("outside.lua");
        std::fs::write(&outside, "must not escape").unwrap();
        std::fs::remove_file(&file).unwrap();
        // Hosted Windows runners must support symbolic links. Failure is coverage failure,
        // never a silent pass; local runs without privilege can choose Unix coverage.
        std::os::windows::fs::symlink_file(&outside, &file)
            .expect("Windows reparse test requires symlink privilege");
        assert!(approved.read(&file).is_err());
        std::fs::remove_file(&file).unwrap();
        std::fs::remove_dir(file.parent().unwrap()).unwrap();
        let outside_directory = temp.path().join("outside-directory");
        std::fs::create_dir(&outside_directory).unwrap();
        std::fs::write(
            outside_directory.join(COLLECTOR),
            "existing escaped directory collector",
        )
        .unwrap();
        std::os::windows::fs::symlink_dir(&outside_directory, file.parent().unwrap()).unwrap();
        assert!(approved.read(&file).is_err());
        std::fs::remove_dir(file.parent().unwrap()).unwrap();
    }
}
