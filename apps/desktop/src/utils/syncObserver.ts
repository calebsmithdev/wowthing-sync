import { listen } from '@tauri-apps/api/event'
import { getSyncStatus, type SyncStatus } from '../composables/useSync'

export async function observeSync(update: (status: SyncStatus) => void) {
  let receivedEvent = false
  const unlisten = await listen<SyncStatus>('sync-status', ({ payload }) => {
    receivedEvent = true
    update(payload)
  })
  try {
    const snapshot = await getSyncStatus()
    if (!receivedEvent) update(snapshot)
  } catch (error) {
    unlisten()
    throw error
  }
  return unlisten
}
