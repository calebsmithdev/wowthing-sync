import { useSync } from './useSync'

export interface ApiKeyStatus { hasKey: boolean; loaded: boolean; error: string | null }
export const useApiKeys = () => {
  const status = useSync()
  return { hasApiKey: computed(() => status.value.hasApiKey) }
}
