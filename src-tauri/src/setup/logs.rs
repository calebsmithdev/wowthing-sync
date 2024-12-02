use tauri::AppHandle;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

pub fn setup_logs(handle: &AppHandle) -> tauri::Result<()> {
    if !cfg!(debug_assertions)
    {
        handle.plugin(
            tauri_plugin_log::Builder::new()
                .target(Target::new(
                    TargetKind::LogDir {
                        file_name: Some("verbose-logs.log".to_string()),
                    }
                ))
                .max_file_size(5_000_000) // 5MB
                .rotation_strategy(RotationStrategy::KeepOne)
                .level(log::LevelFilter::Info)
                .build()
        )?;

        handle.plugin(
            tauri_plugin_log::Builder::new()
                .target(Target::new(
                    TargetKind::LogDir {
                        file_name: Some("error-logs.log".to_string()),
                    }
                ))
                .max_file_size(3_000_000) // 3MB
                .rotation_strategy(RotationStrategy::KeepOne)
                .level(log::LevelFilter::Warn)
                .build()
        )?;
    } else {
        handle.plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Debug)
                .build()
        )?;
    }

    Ok(())
}
