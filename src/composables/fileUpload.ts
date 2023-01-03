// import axios from "axios"
import { readTextFile, BaseDirectory, readDir, FileEntry } from '@tauri-apps/api/fs';
import axios from 'axios';
import { useEffect, useState } from 'react';
import localforage from 'localforage';
import dayjs from 'dayjs';
import { API_KEY, LAST_STARTED_DATE, LAST_UPDATED, PROGRAM_FOLDER } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';

export const useFileUpload = () => {
  const [isProcessing, setProcessing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [watchingFiles, setWatchingFiles] = useState([]);

  useEffect(() => {
    getLastUpdated();
  }, []);

  const startFileWatchingProcess = async () => {
    if(isProcessing) return;
    setProcessing(true);
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    if(!folder || watchingFiles.length > 0) {
      setProcessing(false);
      return;
    }
    console.log('Started watching files')
    const files = await getAllFiles();
    for (const file of files) {
      console.log({watchingFiles})
      if(watchingFiles.find(m => m.path == file.path)) {
        continue;
      }
      const watch = (await import('tauri-plugin-fs-watch-api')).watch
      const stopWatching = await watch(file.path, { recursive: false }, () => handleUpload(false))
      setWatchingFiles(stateFiles => [...stateFiles, {
        stopWatching,
        path: file.path
      }]);
    }
    setProcessing(false);
  }

  const stopFileWatchingProcess = async() => {
    if (watchingFiles.length > 0) {
      console.log('Stopped watching files')
      watchingFiles.forEach(async (item, index) => {
        await item.stopWatching()
        watchingFiles.splice(index, 1);
      })
		}
  }

  const getLastUpdated = async () => {
    const value = await getStorageItem<string>(LAST_UPDATED)
    setLastUpdated(value);
  }

  const handleLastUpdated = async () => {
    const now = dayjs();
    await saveStorageItem(LAST_UPDATED, now.format())
    setLastUpdated(now);
  }

  const getAllFiles = async () : Promise<FileEntry[]> => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    if(!verifyFolderExists) {
      throw new Error('Invalid folder path. Verify you picked the correct World of Warcraft Retail folder.')
    }

    const addonFiles = [];
    const wtfPath = `${folder}/WTF/Account`;
    const accountFolderFiles = await readDir(wtfPath, { dir: BaseDirectory.Home, recursive: true });

    processFileEntries(accountFolderFiles);

    function processFileEntries(entries) {
      for (const entry of entries) {
        if(entry.name === 'WoWthing_Collector.lua') {
          addonFiles.push(entry);
        }

        if (entry.children) {
          processFileEntries(entry.children)
        }
      }
    }

    return addonFiles;
  };

  const verifyFolderExists = async () : Promise<boolean> => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    const wtfPath = `${folder}/WTF/Account`;
    const folderExists = await readDir(wtfPath, { dir: BaseDirectory.Home });
    console.log({folderExists})

    return folderExists.length > 0;
  }

  const handleUpload = async (force = false) => {
    const lastStartedDate = await getStorageItem<string>(LAST_STARTED_DATE);
    if(!force && lastStartedDate && dayjs().diff(dayjs(lastStartedDate), 'seconds') < 15) {
      return;
    }
    await saveStorageItem<string>(LAST_STARTED_DATE, dayjs().format())
    const files = await getAllFiles();
    const dedupedFiles = removeDuplicateFiles(files);
    const apiKey = await getStorageItem<string>(API_KEY)
    for (const file of dedupedFiles) {
      const contents = await readTextFile(file.path, { dir: BaseDirectory.Home });
      const {data} = await axios.post('/api/upload/', {
        apiKey: apiKey,
        luaFile: contents
      }, {
        headers: {
          'User-Agent': `WoWthing Sync - Tauri`
        }
      })
      console.log(`File: ${file.path}; Return: ${data}`);
    }

    await handleLastUpdated();
  }

  const removeDuplicateFiles = (arr) => {
    var unique = arr.reduce(function (files, file) {
      if(!files.find(m => m.path == file.path)) {
        files.push(file);
      }
      return files;
    }, []);
    return unique;
  }

  return {
    handleUpload,
    lastUpdated,
    watchingFiles,
    startFileWatchingProcess,
    stopFileWatchingProcess
  }
}