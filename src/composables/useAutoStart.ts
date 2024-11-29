import { enable, isEnabled, disable } from "@tauri-apps/plugin-autostart";
import { AUTO_START } from "~/constants";

export const useAutoStart = () => {
  const _autoStart = ref(false);

  const getValue = async (): Promise<void> => {
    const value = await getStorageItem<boolean>(AUTO_START)
    _autoStart.value = value ?? false;
  }

  const setValue = async (value: boolean): Promise<void> => {
    await saveStorageItem(AUTO_START, value)
    _autoStart.value = value;

    if (value) {
      await enable();
    } else {
      await disable();
    }

    console.log(`Setting the status for autostart: ${await isEnabled()}`);
  }

  const autoStart = computed({
    get: () => _autoStart.value,
    set: (value: boolean) => setValue(value),
  });

  onMounted(() => {
    getValue();
  });

  return autoStart;
}