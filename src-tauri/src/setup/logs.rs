use tauri::AppHandle;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub fn setup_logs(handle: &AppHandle) -> tauri::Result<()> {
    handle.plugin(
        tauri_plugin_log::Builder::new()
            .clear_targets()
            .targets([
                Target::new(TargetKind::Stdout).filter(|metadata| metadata.level() <= log::LevelFilter::Debug),
                Target::new(TargetKind::LogDir {
                    file_name: Some("verbose-logs.log".to_string())
                }).filter(|metadata| metadata.level() <= log::LevelFilter::Info),
                Target::new(TargetKind::LogDir {
                    file_name: Some("error-logs.log".to_string())
                }).filter(|metadata| metadata.level() <= log::LevelFilter::Warn)
            ])
            .max_file_size(5_000_000) // 5MB
            .rotation_strategy(RotationStrategy::KeepOne)
            .build()
    )?;

    Ok(())
}
