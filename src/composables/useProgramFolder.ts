import { BaseDirectory, exists, readDir } from '@tauri-apps/plugin-fs';
import { type } from '@tauri-apps/plugin-os';
import { PROGRAM_FOLDER } from '../constants';
import * as path from '@tauri-apps/api/path';
import { getStorageItem, saveStorageItem } from '../utils/storage';
import { info } from '@tauri-apps/plugin-log';

const defaultMacFolder = '/Applications/World of Warcraft/_retail_';
const defaultWindowsFolder = 'C:\\Program Files (x86)\\World of Warcraft\\_retail_';
const defaultLinuxFolders = [
  '.wine/drive_c/Program Files (x86)/World of Warcraft/_retail_',
  '.wine/drive_c/Program Files/World of Warcraft/_retail_',
  'Games/world-of-warcraft/drive_c/Program Files (x86)/World of Warcraft/_retail_',
  'Games/world-of-warcraft/drive_c/Program Files/World of Warcraft/_retail_',
];

export const useProgramFolder = () => {
  const _programFolder = ref<string | null>('');

  const getFolder = async () => {
    const value = await getStorageItem<string>(PROGRAM_FOLDER)
    _programFolder.value = value ?? '';
  }

  const setFolder = async (value: string | null) => {
    if(!value) return;
    await saveStorageItem<string>(PROGRAM_FOLDER, value)
    info(`Program folder set to: ${value}`);
    _programFolder.value = value;
  }

  const getDefaultPath = async () => {
    const homeDir = path.homeDir();
    switch(type()) {
      case 'macos':
        const macFolderExists = await exists(defaultMacFolder, { baseDir: BaseDirectory.Home });
        if(macFolderExists) {
          return defaultMacFolder;
        }
        break;
      case 'windows':
        const winFolderExists = await exists(defaultWindowsFolder, { baseDir: BaseDirectory.Home });
        if(winFolderExists) {
          return defaultWindowsFolder;
        }
      case 'linux':
        for (const relPath of defaultLinuxFolders) {
          if (await exists(relPath, { baseDir: BaseDirectory.Home })) {
            // Build the absolute path the rest of the app expects
            return `${homeDir}/${relPath}`;
          }
        }
        break;
      default:
        return await homeDir;
    }

    return await homeDir;
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
