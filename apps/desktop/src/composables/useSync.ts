import { invoke } from '@tauri-apps/api/core'

export interface SyncStatus {
  folder: string | null
  hasApiKey: boolean
  files: string[]
  isProcessing: boolean
  lastSuccess: number | null
  error: string | null
  pending: number
  failures: { file: string; message: string }[]
  warning: string | null
  /** Last successful upload (unix seconds) per collector file. */
  uploads: Record<string, number>
}

export const emptySyncStatus = (): SyncStatus => ({
  folder: null, hasApiKey: false, files: [], isProcessing: false, lastSuccess: null, error: null, pending: 0, failures: [], warning: null, uploads: {},
})
export const getSyncStatus = () => invoke<SyncStatus>('get_sync_status')
export const syncNow = () => invoke<null>('sync_now')
export const useSync = () => useState<SyncStatus>('native-sync', emptySyncStatus)
