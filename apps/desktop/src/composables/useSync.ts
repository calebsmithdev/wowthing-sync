import { invoke } from '@tauri-apps/api/core'

export interface SyncStatus {
  folder: string | null
  files: string[]
  isProcessing: boolean
  lastSuccess: number | null
  error: string | null
  pending: number
}

export const emptySyncStatus = (): SyncStatus => ({
  folder: null, files: [], isProcessing: false, lastSuccess: null, error: null, pending: 0,
})
export const getSyncStatus = () => invoke<SyncStatus>('get_sync_status')
export const configureSync = (folder: string | null) => invoke<void>('configure_sync', { folder })
export const syncNow = () => invoke<void>('sync_now')
export const useSync = () => useState<SyncStatus>('native-sync', emptySyncStatus)
