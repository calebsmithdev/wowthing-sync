import { ref, onMounted } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export default function useUpdater() {
  const updateNeeded = ref(false)

  const handleUpdate = async () => {
    console.log('Attempting to update the app...')
    const update = await check();
    if (update) {
      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            console.log(`started downloading ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            console.log(`downloaded ${downloaded} from ${contentLength}`);
            break;
          case 'Finished':
            console.log('download finished');
            break;
        }
      });

      await relaunch()
    }
  }

  onMounted(async () => {
    const update = await check();
    if (update) {
      updateNeeded.value = true
    }

    setInterval(async () => {
      const update = await check();
      if (update) {
        updateNeeded.value = true
      }
    }, 5 * 60 * 1000)

    listen('tauri://update-available', function (res) {
      console.log('New version available: ', res)
      updateNeeded.value = true
    })
  })

  return {
    updateNeeded,
    handleUpdate
  }
}
