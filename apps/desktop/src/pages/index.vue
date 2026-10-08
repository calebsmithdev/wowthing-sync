<template>
  <div>
    <section v-if="!configured" class="py-4" aria-labelledby="setup-title">
      <h1 id="setup-title">Welcome to WoWthing Sync</h1>
      <p class="mt-2 text-sm text-muted">Connect your account and game folder to upload collector data automatically.</p>
      <ol aria-label="Setup steps" class="mt-6 divide-y divide-default border-y border-default">
        <li v-for="(step, index) in setupSteps" :key="step.title" class="flex items-start gap-3 py-4">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-medium" :class="step.complete ? 'text-success' : 'text-muted'" :aria-label="step.complete ? 'Complete' : undefined">
            <UIcon v-if="step.complete" name="i-lucide-check" class="size-4" aria-hidden="true" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <div>
            <h2 class="text-sm font-medium text-highlighted">{{ step.title }}</h2>
            <p class="mt-1 text-sm text-muted">{{ step.description }}</p>
          </div>
        </li>
      </ol>
      <UButton to="/settings" class="mt-5">Open Settings</UButton>
      <p class="mt-4 text-xs text-muted">Enable the WoWthing Collector addon, then log out of a character or reload the game UI to create its data file.</p>
    </section>

    <section v-else class="flex items-start justify-between gap-4 pt-4 pb-7">
      <div class="min-w-0">
        <h1 class="text-3xl" :title="formattedLastUpdated || undefined">{{ headline }}</h1>
        <p class="mt-2 flex items-center gap-2 text-sm text-muted">
          <span class="size-2 shrink-0 rounded-full" :class="summary.dot" />
          <span>{{ feedback ?? summary.text }}</span>
        </p>
      </div>
      <UButton variant="outline" class="shrink-0" :loading="isProcessing" :disabled="isProcessing" @click="requestSync">Sync Now</UButton>
    </section>

    <section v-if="configured">
      <h2 class="pb-2 text-xs font-medium uppercase tracking-wider text-dimmed">Accounts</h2>
      <ul v-if="accounts.length" class="divide-y divide-default border-y border-default">
        <li
          v-for="account in accounts"
          :key="account.file"
          class="flex items-center justify-between gap-4 py-2.5 text-sm"
          :class="account.failure ? 'border-l-2 border-l-error pl-3' : 'pl-0.5'"
        >
          <span class="truncate font-medium" :title="account.file">{{ account.name }}</span>
          <span v-if="account.failure" class="flex shrink-0 items-center gap-2 text-error">
            <span>Failed · {{ account.failure }}</span>
            <UButton size="xs" variant="link" class="px-0" :disabled="isProcessing" @click="requestSync">Retry</UButton>
          </span>
          <span v-else-if="account.uploaded" class="shrink-0 text-muted" :title="formatted(account.uploaded)">{{ fromNow(account.uploaded) }}</span>
          <span v-else class="shrink-0 text-dimmed">Not uploaded yet</span>
        </li>
      </ul>
      <p v-else class="border-y border-default py-3 text-sm text-muted">
        No collector files found yet. Enable the WoWthing Collector addon, then log out of a character.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { accountName } from '../utils/collector'

const status = useSync()
const { hasApiKey } = useApiKeys()
const { handleUpload, lastUpdated, lastUpdatedFromNow, isProcessing, formattedLastUpdated, fromNow, formatted } = useInternalFileUpload()

const configured = computed(() => hasApiKey.value && !!status.value.folder)
const setupSteps = computed(() => [
  { title: 'Connect your WoWthing account', complete: hasApiKey.value, description: hasApiKey.value ? 'API key saved securely.' : 'Copy your API key from WoWthing Settings → Account.' },
  { title: 'Choose your game folder', complete: !!status.value.folder, description: status.value.folder ? 'World of Warcraft folder selected.' : 'Select the _retail_ folder that contains WTF/Account.' },
])
/** Listed files plus any failing file the scan could not list, so every failure has a row. */
const accounts = computed(() => {
  const { files, failures, uploads } = status.value
  const failed = new Map(failures.map(failure => [failure.file, failure.message]))
  return [...new Set([...files, ...failed.keys()])].map(file => ({
    file, name: accountName(file), failure: failed.get(file), uploaded: uploads[file],
  }))
})
const headline = computed(() => {
  if (isProcessing.value) return 'Syncing…'
  return lastUpdated.value ? `Synced ${lastUpdatedFromNow.value}` : 'Not synced yet'
})
const summary = computed(() => {
  const value = status.value
  const failed = accounts.value.filter(account => account.failure).length
  if (value.error) return { dot: 'bg-error', text: 'Sync is paused. See the message above.' }
  if (failed) return { dot: 'bg-error', text: `${failed} ${failed === 1 ? 'account needs' : 'accounts need'} attention` }
  if (value.pending) return { dot: 'bg-primary', text: 'Upload queued' }
  if (!value.files.length) return { dot: 'bg-warning', text: 'Waiting for collector files' }
  const count = value.files.length
  return { dot: 'bg-success', text: `Watching ${count} ${count === 1 ? 'account' : 'accounts'} for changes` }
})

const feedback = ref<string | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => clearTimeout(feedbackTimer))
const requestSync = async () => {
  clearTimeout(feedbackTimer)
  await handleUpload()
  feedback.value = status.value.error ? null : 'Sync requested. Changed files upload in a moment.'
  feedbackTimer = setTimeout(() => { feedback.value = null }, 5000)
}
</script>
