import { ref, onMounted, onUnmounted } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const CHECK_INTERVAL_MS = 5 * 60 * 1000

export default function useUpdater() {
  const updateNeeded = ref(false)
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unlisten: UnlistenFn | undefined

  const handleUpdate = async () => {
    console.log('Attempting to update the app...')
    {
      // Dispose before relaunch, including when downloading or installing fails.
      await using update = await check()
      if (!update) return

      let downloaded = 0
      let contentLength = 0

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0
            console.log(`Started downloading ${contentLength} bytes`)
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            console.log(`Downloaded ${downloaded} from ${contentLength}`)
            break
          case 'Finished':
            console.log('Download finished')
            break
        }
      })
    }
    await relaunch()
  }

  const pollForUpdate = async () => {
    try {
      // Each check owns a Rust resource, even when only inspecting availability.
      await using update = await check()
      if (!disposed) updateNeeded.value = Boolean(update)
    } catch (error) {
      console.error('Failed to check for updates:', error)
    } finally {
      // Schedule after completion to avoid overlapping checks on slow networks.
      if (!disposed) timer = setTimeout(pollForUpdate, CHECK_INTERVAL_MS)
    }
  }

  onMounted(() => {
    void pollForUpdate()
    void listen('tauri://update-available', () => {
      if (!disposed) updateNeeded.value = true
    }).then((stopListening) => {
      if (disposed) stopListening()
      else unlisten = stopListening
    }).catch((error) => {
      console.error('Failed to listen for updates:', error)
    })
  })

  onUnmounted(() => {
    disposed = true
    clearTimeout(timer)
    unlisten?.()
  })

  return {
    updateNeeded,
    handleUpdate,
  }
}
