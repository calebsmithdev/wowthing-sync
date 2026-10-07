<template>
  <div class="space-y-5">
    <h1>Settings</h1>
    <p v-if="loading" role="status">Loading settings…</p>
    <p v-if="error || dialogError" role="alert" class="text-red-400">{{ error || dialogError }}</p>
    <UButton v-if="!loaded && !loading" @click="settings.hydrate(true)">Retry Loading Settings</UButton>
    <p v-if="notice" role="status">{{ notice }}</p>

    <UFormField label="API Key" name="apiKey" help="Find your API key in WoWthing Settings → Account. Keys are saved in OS credential storage.">
      <UInput v-model="apiKeyDraft" autocomplete="off" class="w-full" :type="showPassword ? 'text' : 'password'" :ui="{ trailing: 'pointer-events-auto' }">
        <template #trailing>
          <UButton color="neutral" variant="link" :icon="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" :aria-label="showPassword ? 'Hide API key' : 'Show API key'" @click="showPassword = !showPassword" />
        </template>
      </UInput>
    </UFormField>
    <p class="text-sm">{{ hasApiKey ? 'An API key is saved securely. Enter a key to replace it.' : 'No API key is saved.' }}</p>
    <UButton :loading="saving === 'api-key'" :disabled="!loaded || busy || !apiKeyDraft.trim()" @click="saveKeyDraft">Save API Key</UButton>

    <UFormField label='World of Warcraft "_retail_" Folder' name="folder" help="Choose the folder containing WTF/Account and collector addon files.">
      <UInput :model-value="folderDraft" readonly class="w-full" />
    </UFormField>
    <div class="flex gap-2">
      <UButton variant="outline" :disabled="busy" @click="openFolderDialog">Choose Folder</UButton>
      <UButton :loading="saving === 'folder'" :disabled="!loaded || busy || !folderDraft || !folderSelected && folderDraft === state.folder" @click="saveFolderDraft">Save Folder</UButton>
    </div>

    <div class="space-y-3">
      <UCheckbox label="Enable desktop notifications" :model-value="state.notificationsEnabled" :disabled="!loaded || busy" @update:model-value="setNotifications($event === true)" />
      <p class="text-sm text-gray-400">Notification delivery permission is not reported by this platform. Check your OS notification settings.</p>
      <UCheckbox label="Launch WoWthing Sync when you start your computer" :model-value="state.autoStart ?? false" :disabled="!loaded || busy || state.autoStart === null" @update:model-value="setAutostart($event === true)" />
      <p v-if="state.autoStartError" role="alert" class="text-red-400">{{ state.autoStartError }}</p>
    </div>
    <UButton variant="outline" :loading="updaterBusy" @click="checkForUpdates(true)">Check for Updates</UButton>
  </div>
</template>

<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'

const settings = useSettings()
const { state, loading, loaded, busy, saving, error, notice, setAutostart, setNotifications } = settings
const { hasApiKey } = useApiKeys()
const { busy: updaterBusy, checkForUpdates } = useUpdater()
const apiKeyDraft = ref('')
const folderDraft = ref(state.value.folder ?? '')
const folderSelected = ref(false)
const showPassword = ref(false)
const dialogError = ref<string | null>(null)
const saveKeyDraft = async () => { if (await settings.saveKey(apiKeyDraft.value)) apiKeyDraft.value = '' }
const saveFolderDraft = async () => { if (await settings.saveFolder(folderDraft.value)) { folderDraft.value = state.value.folder ?? ''; folderSelected.value = false } }
const openFolderDialog = async () => {
  dialogError.value = null
  try {
    const selected = await open({ directory: true, multiple: false, defaultPath: folderDraft.value || await settings.defaultFolder() })
    if (typeof selected === 'string') { folderDraft.value = selected; folderSelected.value = true }
  } catch (cause) { dialogError.value = String(cause) }
}
</script>
