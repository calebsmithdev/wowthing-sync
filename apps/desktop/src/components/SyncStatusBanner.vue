<template>
  <div v-if="status.error || status.warning || accountFailures" role="alert">
    <UAlert
      :color="status.error || accountFailures ? 'error' : 'warning'"
      variant="subtle"
      icon="i-lucide-triangle-alert"
    >
      <template #description>
        <div class="space-y-2">
          <p v-if="status.error">{{ status.error }}</p>
          <p v-if="status.warning">{{ status.warning }}</p>
          <p v-if="accountFailures">{{ accountFailures }} {{ accountFailures === 1 ? 'account' : 'accounts' }} failed to upload.</p>
          <p v-if="retryError" class="font-medium">Retry failed: {{ retryError }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton size="sm" color="neutral" variant="outline" :loading="retrying" @click="retry">Retry Sync</UButton>
            <UButton v-if="accountFailures" size="sm" color="neutral" variant="ghost" to="/">View Accounts</UButton>
            <UButton v-else-if="route.path !== '/settings'" size="sm" color="neutral" variant="ghost" to="/settings">Open Settings</UButton>
          </div>
        </div>
      </template>
    </UAlert>
  </div>
</template>

<script setup lang="ts">
import { syncNow } from '../composables/useSync'
/** App-wide problems. Per-account failures are shown on their rows on the Status page. */
const status = useSync()
const route = useRoute()
const retrying = ref(false)
const retryError = ref<string | null>(null)
const accountFailures = computed(() => route.path === '/' ? 0 : status.value.failures.length)
const retry = async () => {
  retrying.value = true; retryError.value = null
  try { await syncNow() } catch (cause) { retryError.value = String(cause) }
  finally { retrying.value = false }
}
</script>
