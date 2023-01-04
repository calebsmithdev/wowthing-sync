import { BaseDirectory, exists, readDir } from '@tauri-apps/api/fs';
import { useEffect, useState } from 'react'
import { PROGRAM_FOLDER } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';

const defaultMacFolder = '/Applications/World of Warcraft/_retail_';
const defaultWindowsFolder = 'C:\Program Files (x86)\World of Warcraft\_retail_';

export const useProgramFolder = () => {
  const [programFolder, setProgramFolder] = useState('');

  useEffect(() => {
    getKey();
  }, []);

  const getKey = async () => {
    const value = await getStorageItem<string>(PROGRAM_FOLDER)
    setProgramFolder(value);
  }

  const setFolder = async (value) => {
    if(!value) return;
    const testValue = await saveStorageItem<string>(PROGRAM_FOLDER, value)
    console.log({testValue})
    setProgramFolder(value);
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

  return {
    folder: programFolder,
    setFolder,
    getDefaultPath
  }
}