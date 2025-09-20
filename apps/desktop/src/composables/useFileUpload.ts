import { BaseDirectory, readDir, type DirEntry, type WatchEvent, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { watch } from '@tauri-apps/plugin-fs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import dayjs from 'dayjs';
import { LAST_STARTED_DATE, LAST_UPDATED, PROGRAM_FOLDER } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';
import { join } from '@tauri-apps/api/path';
import { error, info } from '@tauri-apps/plugin-log';
import { platform } from '@tauri-apps/plugin-os';
import { submitAddonData } from './useThingApi';

export const useInternalFileUpload = () => {
  dayjs.extend(relativeTime)
  dayjs.extend(localizedFormat);

  const daysAgoInterval = ref(null);
  const isProcessing = ref(false);
  const stopWatching = ref<UnwatchFn>(null);
  const lastUpdatedFromNow = ref('');
  const lastUpdated = useState(LAST_UPDATED, () => dayjs());
  const watchingFiles = useState('watching-files', () => ([]));
  const notifications = useNotifications();
  const formattedLastUpdated = computed(() => dayjs(lastUpdated.value).format('lll'));

  const startFileWatchingProcess = async () => {
    const folder = await getStorageItem<string>(PROGRAM_FOLDER)
    if(!folder || watchingFiles.value.length > 0) {
      return;
    }

    const files = await getAllFiles();
    const stop = await watch(files, (e) => handleUpload(false, e), {
      baseDir: BaseDirectory.Home,
      delayMs: 1000
    });
    stopWatching.value = stop;

    info(`Started watching files: ${JSON.stringify(files)}`);
  }

  const stopFileWatchingProcess = () => {
    watchingFiles.value = [];
    if(typeof stopWatching.value !== 'function') return;
    stopWatching.value();
    info('Stopped watching files');
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
    let accountFolderFiles: DirEntry[];
    try {
      accountFolderFiles = await readDir(wtfPath, { baseDir: BaseDirectory.Home });
    } catch (err) {
      if (err?.toString().includes('forbidden path')) {
        await notifications.send({
          title: 'Permission Denied',
          body: `The app does not have permission to access "${wtfPath}". Please inform the dev of this issue.`,
        });
      } else {
        await notifications.send({
          title: 'Error',
          body: `An error occurred while reading files: ${err}`,
        });
      }
      throw err;
    }

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

    try {
      const folderExists = await readDir(wtfPath, { baseDir: BaseDirectory.Home });
      return folderExists.length > 0;
    } catch (err) {
      if (err?.toString().includes('forbidden path')) {
        await notifications.send({
          title: 'Permission Denied',
          body: `The app does not have permission to access "${wtfPath}".`,
        });
        return false;
      }
      throw err;
    }
  }

  const isModifyAnyEvent = (event: WatchEvent): boolean => {
    const currentPlatform = platform();
    if(currentPlatform === 'macos') {
      return typeof event.type === 'object' && 'modify' in event.type && (event.type.modify.kind === 'any' || event.type.modify.kind === 'rename');
    } else {
      return typeof event.type === 'object' && 'modify' in event.type && event.type.modify.kind === 'any';
    }
  }

  const handleUpload = async (force: boolean = false, event: WatchEvent = null) => {
    const lastStartedDate = await getStorageItem<string>(LAST_STARTED_DATE);
    if (!force && lastStartedDate && dayjs().diff(dayjs(lastStartedDate), 'seconds') < 15) {
      return;
    }

    // `watch` triggers multiple events when a file is changed. We are specifically looking for just one event.
    // Current observerd options are: `modify` and `remove. For `kind`,  `any` and `remove` are the options.
    if (event && !isModifyAnyEvent(event)) {
      return;
    }
    console.log({event})

    isProcessing.value = true;
    await saveStorageItem<string>(LAST_STARTED_DATE, dayjs().format());
    let dedupedFiles = [];

    // If event is null, we are uploading all files.
    if(!event) {
      const files = await getAllFiles();
      dedupedFiles = removeDuplicateFiles(files);
    } else {
      dedupedFiles = removeDuplicateFiles(event.paths);
    }

    for (const file of dedupedFiles) {
      info(`Uploading file: ${file} at file path: ${file}`);

      try {
        const message = await submitAddonData(file);
        info(`Uploaded file: ${file}`);
        info(`API response from ${file}: ${message}`);
      } catch (result) {
        error(`File failed to upload! File: ${file}; Return: ${result}`);
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
