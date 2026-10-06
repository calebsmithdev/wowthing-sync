import { invoke } from '@tauri-apps/api/core'
import { useSync } from './useSync'

export interface ApiKeyStatus { hasKey: boolean; loaded: boolean; error: string | null }
export const saveApiKey = (key: string) => invoke<ApiKeyStatus>('save_api_key', { key })
export const useApiKeys = () => {
  const status = useSync()
  return {
    hasApiKey: computed(() => status.value.hasApiKey),
    saveKey: async (key: string) => {
      const saved = await saveApiKey(key)
      status.value.hasApiKey = saved.hasKey
      status.value.warning = saved.error
      return saved
    },
  }
}
