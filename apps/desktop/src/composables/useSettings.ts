import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ApiKeyStatus } from './useApiKeys'

export interface SettingsSnapshot {
  folder: string | null
  hasApiKey: boolean
  autoStart: boolean | null
  autoStartError: string | null
  notificationsEnabled: boolean
  notificationPermission: 'unknown' | 'granted' | 'denied'
}
export const emptySettings = (): SettingsSnapshot => ({ folder: null, hasApiKey: false, autoStart: null, autoStartError: null, notificationsEnabled: false, notificationPermission: 'unknown' })
export type SettingAction = 'api-key' | 'folder' | 'autostart' | 'notifications'
export function createSettings() {
  const state = ref<SettingsSnapshot>(emptySettings())
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref<SettingAction | null>(null)
  const error = ref<string | null>(null)
  const notice = ref<string | null>(null)
  /** The setting that `error`/`notice` belong to; null for loading the settings themselves. */
  const scope = ref<SettingAction | null>(null)
  let hydration: Promise<void> | undefined
  const hydrate = (force = false): Promise<void> => {
    if (hydration) return hydration
    if (loaded.value && !force) return Promise.resolve()
    loading.value = true
    hydration = invoke<SettingsSnapshot>('get_settings').then(value => { state.value = value; loaded.value = true; error.value = null })
      .catch(cause => { error.value = String(cause) }).finally(() => { loading.value = false; hydration = undefined })
    return hydration
  }
  const perform = async (action: SettingAction, operation: () => Promise<SettingsSnapshot>): Promise<boolean> => {
    if (saving.value) return false
    saving.value = action; scope.value = action; error.value = null; notice.value = null
    try { state.value = await operation(); notice.value = 'Settings saved.'; return true }
    catch (cause) {
      const failure = String(cause)
      await hydrate(true) // Reconcile actual OS/disk state after a failed change/rollback.
      error.value = failure
      return false
    } finally { saving.value = null }
  }
  const saveKey = async (key: string): Promise<boolean> => perform('api-key', async () => {
    const saved = await invoke<ApiKeyStatus>('save_api_key', { key })
    if (saved.error) error.value = saved.error
    return { ...state.value, hasApiKey: saved.hasKey }
  })
  return {
    state, loaded, loading, saving, error, notice, scope, busy: computed(() => loading.value || saving.value !== null), hydrate, saveKey,
    saveFolder: (folder: string) => perform('folder', () => invoke<SettingsSnapshot>('save_sync_folder', { folder })),
    setAutostart: (enabled: boolean) => perform('autostart', () => invoke<SettingsSnapshot>('set_autostart', { enabled })),
    setNotifications: (enabled: boolean) => perform('notifications', () => invoke<SettingsSnapshot>('set_notifications', { enabled })),
    defaultFolder: () => invoke<string>('default_wow_folder'),
  }
}
export type SettingsController = ReturnType<typeof createSettings>
export const useSettings = (): SettingsController => useNuxtApp().$settings
