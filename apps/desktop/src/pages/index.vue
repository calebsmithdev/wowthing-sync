<template>
  <div>
    <section class="flex items-start justify-between gap-4 pt-4 pb-7">
      <div class="min-w-0">
        <h1 class="text-3xl" :title="formattedLastUpdated || undefined">{{ headline }}</h1>
        <p class="mt-2 flex items-center gap-2 text-sm text-muted">
          <span class="size-2 shrink-0 rounded-full" :class="summary.dot" />
          <span>{{ feedback ?? summary.text }}</span>
        </p>
      </div>
      <UButton v-if="!configured" to="/settings" variant="outline" class="shrink-0">Open Settings</UButton>
      <UButton v-else variant="outline" class="shrink-0" :loading="isProcessing" :disabled="isProcessing" @click="requestSync">Sync Now</UButton>
    </section>

    <section v-if="status.folder">
      <h2 class="pb-2 text-xs font-medium uppercase tracking-wider text-dimmed">Accounts</h2>
      <ul v-if="accounts.length" class="divide-y divide-default border-y border-default">
        <li
          v-for="account in accounts"
          :key="account.file"
          class="flex items-center justify-between gap-4 py-2.5 text-sm"
          :class="account.failure ? 'border-l-2 border-error pl-3' : 'pl-0.5'"
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
/** Listed files plus any failing file the scan could not list, so every failure has a row. */
const accounts = computed(() => {
  const { files, failures, uploads } = status.value
  const failed = new Map(failures.map(failure => [failure.file, failure.message]))
  return [...new Set([...files, ...failed.keys()])].map(file => ({
    file, name: accountName(file), failure: failed.get(file), uploaded: uploads[file],
  }))
})
const headline = computed(() => {
  if (!configured.value) return 'Finish setup'
  if (isProcessing.value) return 'Syncing…'
  return lastUpdated.value ? `Synced ${lastUpdatedFromNow.value}` : 'Not synced yet'
})
const summary = computed(() => {
  const value = status.value
  const failed = accounts.value.filter(account => account.failure).length
  if (!hasApiKey.value) return { dot: 'bg-warning', text: 'Add your WoWthing API key in Settings to start syncing.' }
  if (!value.folder) return { dot: 'bg-warning', text: 'Choose your World of Warcraft folder in Settings.' }
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
