<template>
  <div class="space-y-7 pt-2">
    <h1 class="sr-only">Settings</h1>
    <p v-if="loading" role="status" class="text-sm text-muted">Loading settings…</p>
    <div v-if="loadFailed" role="alert">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Settings could not be loaded"
        :description="error ?? 'Try loading them again.'"
        :actions="[{ label: 'Retry Loading Settings', color: 'neutral', variant: 'outline', onClick: () => settings.hydrate(true) }]"
      />
    </div>

    <section>
      <h2 class="section-title">WoWthing Account</h2>
      <div class="group-rows">
        <div class="space-y-2 py-3">
          <UFormField label="API Key" name="apiKey" :description="hasApiKey ? 'An API key is saved securely in your system credential store.' : 'Find your API key in WoWthing Settings → Account.'">
            <div class="flex gap-2">
              <UInput
                v-model="apiKeyDraft"
                autocomplete="off"
                class="flex-1"
                :placeholder="hasApiKey ? 'Paste a new key to replace it' : 'Paste your API key'"
                :type="showPassword ? 'text' : 'password'"
                :ui="{ trailing: 'pointer-events-auto' }"
                @keydown.enter="canSaveKey && saveKeyDraft()"
              >
                <template #trailing>
                  <UButton color="neutral" variant="ghost" size="sm" :icon="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" :aria-label="showPassword ? 'Hide API key' : 'Show API key'" @click="showPassword = !showPassword" />
                </template>
              </UInput>
              <UButton :loading="saving === 'api-key'" :disabled="!canSaveKey" @click="saveKeyDraft">Save API Key</UButton>
            </div>
          </UFormField>
          <p v-if="messageFor('api-key')" :role="messageFor('api-key')!.role" class="text-sm" :class="messageFor('api-key')!.class">{{ messageFor('api-key')!.text }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">Game Folder</h2>
      <div class="group-rows">
        <div class="space-y-2 py-3">
          <UFormField label='World of Warcraft "_retail_" Folder' name="folder" description="The folder that contains WTF/Account.">
            <UInput :model-value="state.folder ?? ''" placeholder="No folder selected" readonly class="w-full" :ui="{ base: 'font-mono text-xs' }" />
          </UFormField>
          <p v-if="flavorWarning" class="text-sm text-warning">{{ flavorWarning }}</p>
          <div class="flex flex-wrap items-center gap-2">
            <UButton color="neutral" variant="outline" :loading="saving === 'folder'" :disabled="!loaded || busy" @click="chooseFolder">Choose Folder</UButton>
            <UButton color="neutral" variant="ghost" :disabled="!loaded || busy" @click="useDefaultFolder">Use Default Location</UButton>
          </div>
          <p v-if="dialogError" id="folder-message" role="alert" class="text-sm text-error">{{ dialogError }}</p>
          <p v-else-if="messageFor('folder')" id="folder-message" :role="messageFor('folder')!.role" class="text-sm" :class="messageFor('folder')!.class">{{ messageFor('folder')!.text }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">General</h2>
      <div class="group-rows">
        <div class="py-3">
          <USwitch
            label="Desktop notifications"
            description="Notify when a sync finishes, with one summary for all accounts. If none appear, allow them for WoWthing Sync in your system settings."
            :model-value="state.notificationsEnabled"
            :disabled="!loaded || busy"
            :ui="{ root: 'flex-row-reverse justify-between gap-6', wrapper: 'ms-0' }"
            @update:model-value="setNotifications($event === true)"
          />
          <p v-if="messageFor('notifications')" :role="messageFor('notifications')!.role" class="mt-1 text-sm" :class="messageFor('notifications')!.class">{{ messageFor('notifications')!.text }}</p>
        </div>
        <div class="py-3">
          <USwitch
            label="Launch at login"
            description="Start in the background when you sign in to your computer."
            :model-value="state.autoStart ?? false"
            :disabled="!loaded || busy || state.autoStart === null"
            :ui="{ root: 'flex-row-reverse justify-between gap-6', wrapper: 'ms-0' }"
            @update:model-value="setAutostart($event === true)"
          />
          <p v-if="state.autoStartError" role="alert" class="mt-1 text-sm text-error">{{ state.autoStartError }}</p>
          <p v-if="messageFor('autostart')" :role="messageFor('autostart')!.role" class="mt-1 text-sm" :class="messageFor('autostart')!.class">{{ messageFor('autostart')!.text }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="section-title">About</h2>
      <div class="group-rows">
        <div class="flex items-center justify-between gap-4 py-3">
          <div class="text-sm">
            <p class="font-medium text-highlighted">Updates</p>
            <p v-if="updaterPhase === 'error' && updaterErrorOperation === 'check' && !updateVisible" role="status" class="text-muted">Updates could not be checked. You can try again here.</p>
            <p v-else class="text-muted">Checked automatically while the app is running.</p>
          </div>
          <UButton color="neutral" variant="outline" class="shrink-0" :loading="updaterBusy" @click="checkForUpdates(true)">Check for Updates</UButton>
        </div>
        <p class="py-3 text-sm text-muted">
          Built by <a href="https://wowthing.org/user/Failcookie" target="_blank" class="underline hover:text-primary">Failcookie</a>.
          Powered by <a href="https://wowthing.org" target="_blank" class="underline hover:text-primary">WoWthing</a>.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import type { SettingAction } from '../composables/useSettings'
import { folderFlavor } from '../utils/collector'

const settings = useSettings()
const { state, loading, loaded, busy, saving, error, notice, scope, setAutostart, setNotifications } = settings
const { hasApiKey } = useApiKeys()
const { busy: updaterBusy, phase: updaterPhase, errorOperation: updaterErrorOperation, visible: updateVisible, checkForUpdates } = useUpdater()
const apiKeyDraft = ref('')
const showPassword = ref(false)
const dialogError = ref<string | null>(null)

const loadFailed = computed(() => !loading.value && (!loaded.value || (scope.value === null && !!error.value)))
const canSaveKey = computed(() => loaded.value && !busy.value && !!apiKeyDraft.value.trim())
const flavorWarning = computed(() => {
  const flavor = state.value.folder ? folderFlavor(state.value.folder) : ''
  return flavor && flavor.toLowerCase() !== '_retail_' ? `This folder is "${flavor}", not "_retail_". WoWthing Sync expects the retail game folder.` : null
})

/** Results are shown beside the setting that produced them. */
const messageFor = (action: SettingAction) => {
  if (scope.value !== action) return null
  if (error.value) return { role: 'alert', class: 'text-error', text: error.value }
  if (notice.value) return { role: 'status', class: 'text-success', text: notice.value }
  return null
}

const saveKeyDraft = async () => { if (await settings.saveKey(apiKeyDraft.value)) apiKeyDraft.value = '' }
// Picking a folder in the OS dialog is the explicit approval; it is validated and saved immediately.
const chooseFolder = async () => {
  dialogError.value = null
  let selected: string | string[] | null
  try {
    selected = await open({ directory: true, multiple: false, defaultPath: state.value.folder || await settings.defaultFolder() })
  } catch (cause) { dialogError.value = String(cause); return }
  if (typeof selected === 'string') await settings.saveFolder(selected)
}
const useDefaultFolder = async () => {
  dialogError.value = null
  let folder: string
  try { folder = await settings.defaultFolder() } catch (cause) { dialogError.value = String(cause); return }
  await settings.saveFolder(folder)
}
</script>

<style scoped>
@reference "../assets/styles/main.css";

.section-title {
  @apply pb-1 text-xs font-medium uppercase tracking-wider text-dimmed;
}

.group-rows {
  @apply divide-y divide-default border-y border-default;
}
</style>
