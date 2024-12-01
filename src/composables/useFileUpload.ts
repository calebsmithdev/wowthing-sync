import { BaseDirectory, readDir, type ReadFileOptions, type DirEntry, readTextFileLines } from '@tauri-apps/plugin-fs';
import { watch } from '@tauri-apps/plugin-fs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import dayjs from 'dayjs';
import { API_KEY, LAST_STARTED_DATE, LAST_UPDATED, PROGRAM_FOLDER } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
// import { useLogs } from '../providers/LogProvider';

export const useFileUpload = () => {
  dayjs.extend(relativeTime)
  dayjs.extend(localizedFormat);

  const daysAgoInterval = ref(null);
  const isProcessing = ref(false);
  const lastUpdatedFromNow = ref('');
  const lastUpdated = useState(LAST_UPDATED, () => dayjs());
  const watchingFiles = useState('watching-files', () => ([]));
  const notifications = useNotifications();
  const formattedLastUpdated = computed(() => dayjs(lastUpdated.value).format('lll'));
  // const { addLog } = useLogs();

  const startFileWatchingProcess = async () => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    if(!folder || watchingFiles.value.length > 0) {
      return;
    }

    console.log('Started watching files')
    const files = await getAllFiles();
    for (const file of files) {
      if(watchingFiles.value.find(m => m == file)) {
        continue;
      }

      const stopWatching = await watch(file, () => handleUpload(false), {
        baseDir: BaseDirectory.Home
      });

      watchingFiles.value.push({
        stopWatching,
        path: file
      })
    }
  }

  const stopFileWatchingProcess = async() => {
    if (watchingFiles.value.length > 0) {
      console.log('Stopped watching files')
      watchingFiles.value.forEach(async (item, index) => {
        await item.stopWatching()
        watchingFiles.value.splice(index, 1);
      })
		}
  }

  const getLastUpdated = async () => {
    const value = await getStorageItem<string>(LAST_UPDATED)
    lastUpdated.value = value;
    lastUpdatedFromNow.value = value ? dayjs(value).fromNow() : '';
  }

  const handleLastUpdated = async () => {
    const now = dayjs();
    await saveStorageItem(LAST_UPDATED, now.format())
    lastUpdated.value = now;
    lastUpdatedFromNow.value = dayjs(now).fromNow();
  }

  const getAllFiles = async (): Promise<string[]> => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    if(!verifyFolderExists) {
      throw new Error('Invalid folder path. Verify you picked the correct World of Warcraft Retail folder.')
    }

    const addonFiles = [];
    const wtfPath = `${folder}/WTF/Account`;
    const accountFolderFiles = await readDir(wtfPath, { baseDir: BaseDirectory.Home });

    await processEntriesRecursively(wtfPath, accountFolderFiles);

    async function processEntriesRecursively(parent: string, entries: DirEntry[]) {
      for (const entry of entries) {
        if (entry.isDirectory) {
          const dir = await join(parent, entry.name);
          const dirEntries = await readDir(dir, { baseDir: BaseDirectory.Home });
          await processEntriesRecursively(dir, dirEntries);
        } else if (entry.name === 'WoWthing_Collector.lua') {
          const fullPath = await join(parent, entry.name);
          addonFiles.push(fullPath);
        }
      }
    }

    return addonFiles;
  };

  const verifyFolderExists = async () : Promise<boolean> => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    const wtfPath = `${folder}/WTF/Account`;
    const folderExists = await readDir(wtfPath, { baseDir: BaseDirectory.Home });

    return folderExists.length > 0;
  }

  const handleUpload = async (force = false) => {
    const lastStartedDate = await getStorageItem<string>(LAST_STARTED_DATE);
    if (!force && lastStartedDate && dayjs().diff(dayjs(lastStartedDate), 'seconds') < 15) {
      return;
    }
    isProcessing.value = true;
    await saveStorageItem<string>(LAST_STARTED_DATE, dayjs().format());
    const files = await getAllFiles();
    const dedupedFiles = removeDuplicateFiles(files);

    for (const file of dedupedFiles) {
      // addLog({
      //   date: new Date(),
      //   title: 'Attempting to upload...',
      //   note: `File path: ${file.path}`
      // });
      const contents = await readBigFile(file, { baseDir: BaseDirectory.Home });

      try {
        const message = await invoke('submit_addon_data', { contents });

        // addLog({
        //   date: new Date(),
        //   title: 'Uploaded file!',
        //   note: `File path: ${file.path}; Return: ${message}`
        // });
        console.log(`File: ${file}; Return: ${message}`);
      } catch (error) {
        // addLog({
        //   date: new Date(),
        //   title: 'File failed to upload!',
        //   note: `File path: ${file.path}; Return: ${error}`
        // });
        console.log(`File: ${file}; Return: ${error}`);
        await notifications.send({ title: 'Wowthing Sync', body: 'An error occurred while uploading. Please try again later.' });
        isProcessing.value = false;
        return; // Stop the rest of the loop from working
      }
    }

    await handleLastUpdated();
    await notifications.send({ title: 'Wowthing Sync', body: 'Upload was completed successfully' });
    isProcessing.value = false;
  };

  const removeDuplicateFiles = (arr) => {
    var unique = arr.reduce(function (files, file) {
      if(!files.find(m => m == file)) {
        files.push(file);
      }
      return files;
    }, []);
    return unique;
  }

  const readBigFile = async (filePath: string, options?: ReadFileOptions) => {
    const lines = await readTextFileLines(filePath, options);
    let fileData = '';
    for await (const line of lines) {
      fileData += line;
    }

    return fileData;
  };

  onMounted(() => {
    getLastUpdated();

     // Trigger reactivity
    daysAgoInterval.value = setInterval(() => {
      lastUpdatedFromNow.value = dayjs(lastUpdated.value).fromNow();
    }, 10000); // Every 10 seconds
  })

  onUnmounted(async () => {
    clearInterval(daysAgoInterval.value);
  })

  return {
    lastUpdatedFromNow,
    handleUpload,
    isProcessing,
    lastUpdated,
    watchingFiles,
    formattedLastUpdated,
    startFileWatchingProcess,
    stopFileWatchingProcess
  }
}
