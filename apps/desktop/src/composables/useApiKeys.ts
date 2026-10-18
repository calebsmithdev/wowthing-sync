import { useSync } from './useSync'

export interface ApiKeyStatus { hasKey: boolean; loaded: boolean; error: string | null; storedLocally: boolean }
export const useApiKeys = () => {
  const status = useSync()
  return { hasApiKey: computed(() => status.value.hasApiKey), storedLocally: computed(() => status.value.apiKeyStoredLocally) }
}
