import { info } from "@tauri-apps/plugin-log";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { NOTIFICATIONS_ENABLED } from "~/constants";

export const useNotifications = () => {
  const _notificationsEnabled = ref(false);

  const getValue = async (): Promise<void> => {
    const value = await getStorageItem<boolean>(NOTIFICATIONS_ENABLED)
    _notificationsEnabled.value = value ?? false;
  }

  const setValue = async (value: boolean): Promise<void> => {
    await saveStorageItem(NOTIFICATIONS_ENABLED, value)
    _notificationsEnabled.value = value;

    if (value) {
      let permissionGranted = await isPermissionGranted();

      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
    }
    send({ title: 'Notifications enabled', body: 'You will now receive notifications' });
    info(`Option for enabling notifications: ${_notificationsEnabled.value}`);
  }

  const send = async (options) => {
    if(!notificationsEnabled.value) {
      return;
    }

    let permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification(options);
    }
  };

  const notificationsEnabled = computed({
    get: () => _notificationsEnabled.value,
    set: (value: boolean) => setValue(value),
  });

  onMounted(() => {
    getValue();
  });

  return {
    notificationsEnabled,
    send
  }
}
