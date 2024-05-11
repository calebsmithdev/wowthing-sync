import { ref, onMounted } from 'vue'
import { emit, listen } from '@tauri-apps/api/event'
import { installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

export default function useUpdater() {
  const updateNeeded = ref(false)

  const handleUpdate = async () => {
    console.log('Attempting to update the app...')
    await installUpdate()
    await relaunch()
  }

  onMounted(() => {
    emit('tauri://update')

    setInterval(() => {
      emit("tauri://update")
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