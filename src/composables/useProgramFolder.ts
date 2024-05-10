import { BaseDirectory, exists, readDir } from '@tauri-apps/api/fs';
import { PROGRAM_FOLDER } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';

const defaultMacFolder = '/Applications/World of Warcraft/_retail_';
const defaultWindowsFolder = 'C:\\Program Files (x86)\\World of Warcraft\\_retail_';

export const useProgramFolder = () => {
  const _programFolder = ref<string | null>('');

  const getFolder = async () => {
    const value = await getStorageItem<string>(PROGRAM_FOLDER)
    _programFolder.value = value ?? '';
  }

  const setFolder = async (value: string | null) => {
    if(!value) return;
    await saveStorageItem<string>(PROGRAM_FOLDER, value)
    _programFolder.value = value;
  }

  const getDefaultPath = async () => {
    const type = (await import('@tauri-apps/api/os')).type
    const homeDir = (await import('@tauri-apps/api/path')).homeDir;
    const ostype = await type();
    if(ostype === 'Darwin') {
      const macFolderExists = await exists(defaultMacFolder, { dir: BaseDirectory.Home });
      if(macFolderExists) {
        return defaultMacFolder;
      } else {
        return await homeDir();
      }
    }

    if(ostype === 'Windows_NT') {
      const winFolderExists = await exists(defaultWindowsFolder, { dir: BaseDirectory.Home });
      if(winFolderExists) {
        return defaultWindowsFolder;
      } else {
        return await homeDir();
      }
    }

    return await homeDir();
  }

  const programFolder = computed({
    get: () => _programFolder.value,
    set: (value: string | null) => setFolder(value),
  });

  onMounted(() => {
    getFolder();
  });

  return {
    folder: programFolder,
    getDefaultPath
  }
}