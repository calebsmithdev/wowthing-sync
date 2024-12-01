import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export const useNotifications = () => {
  const send = async (options) => {
    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification(options);
    }
  };

  return {
    send
  }
}
