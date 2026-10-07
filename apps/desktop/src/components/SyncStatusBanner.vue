<template>
  <div v-if="status.error || status.failures.length || status.warning" role="alert" class="mb-4 rounded border border-amber-500 p-3 text-sm">
    <p v-if="status.error">{{ status.error }}</p>
    <template v-if="status.failures.length">
      <p>{{ status.failures.length }} collector file(s) failed to upload. Successful uploads are preserved.</p>
      <ul class="mt-2 space-y-1">
        <li v-for="failure in status.failures" :key="failure.file">{{ failure.file }}: {{ failure.message }}</li>
      </ul>
    </template>
    <p v-if="status.warning">{{ status.warning }}</p>
    <UButton class="mr-3" variant="outline" :loading="retrying" @click="retry">Retry Sync</UButton>
    <p v-if="retryError">{{ retryError }}</p>
    <NuxtLink to="/settings" class="underline">Open Settings</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { syncNow } from '../composables/useSync'
const status = useSync()
const retrying = ref(false)
const retryError = ref<string | null>(null)
const retry = async () => {
  retrying.value = true; retryError.value = null
  try { await syncNow() } catch (cause) { retryError.value = String(cause) }
  finally { retrying.value = false }
}
</script>
