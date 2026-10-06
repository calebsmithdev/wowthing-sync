use tauri::webview::{PermissionKind, PermissionResponse};

pub fn webview_permission_response(kind: PermissionKind) -> PermissionResponse {
    match kind {
        // Notifications retain the existing plugin/OS consent flow.
        PermissionKind::Notifications => PermissionResponse::Default,
        // Sync uses native Tauri commands, not browser hardware or filesystem APIs.
        _ => PermissionResponse::Deny,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notifications_are_not_automatically_granted() {
        assert_eq!(
            webview_permission_response(PermissionKind::Notifications),
            PermissionResponse::Default
        );
    }

    #[test]
    fn unrelated_and_unknown_browser_permissions_are_denied() {
        for kind in [
            PermissionKind::Camera,
            PermissionKind::Microphone,
            PermissionKind::Geolocation,
            PermissionKind::DisplayCapture,
            PermissionKind::ClipboardRead,
            PermissionKind::FileSystemAccess,
            PermissionKind::Other,
        ] {
            assert_eq!(webview_permission_response(kind), PermissionResponse::Deny);
        }
    }
}
