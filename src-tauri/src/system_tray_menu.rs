use tauri::{command, SystemTraySubmenu};
use tauri::{CustomMenuItem, SystemTrayMenu, SystemTrayMenuItem};

#[command]
pub fn build_system_tray_menu() -> SystemTrayMenu {
  let menuitem_quit = CustomMenuItem::new("quit".to_string(), "Quit");
  let menuitem_show = CustomMenuItem::new("show".to_string(), "Open Window");

  let submenu_preferences = SystemTrayMenu::new()
      .add_item(CustomMenuItem::new("logs", "View Logs"))
      .add_item(CustomMenuItem::new("check-update", "Check for Updates"))
      .add_item(CustomMenuItem::new("restart", "Restart App"));

  SystemTrayMenu::new()
      .add_item(menuitem_show)
      .add_native_item(SystemTrayMenuItem::Separator)
      .add_submenu(SystemTraySubmenu::new("Preferences", submenu_preferences))
      .add_native_item(SystemTrayMenuItem::Separator)
      .add_item(menuitem_quit)
}