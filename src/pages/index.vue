<template>
  <div class="container py-16">
    <div class="text-center">
      <h1 class="mb-5">Addon Sync</h1>

      <div class="mb-4">
        <template v-if="lastUpdated">
          Data uploaded {{ lastUpdatedFromNow }}
        </template>
        <template v-else>
          Waiting to upload
        </template>
      </div>

      <template v-if="apiKey">
        <UButton @click="handleUpload(true)" :loading="isProcessing" :disabled="isProcessing">Manually Upload Data</UButton>
      </template>
      <template v-else>
        <UButton to="/settings">Configure API</UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  const apiKey = useApiKeys();
  const { handleUpload, lastUpdated, lastUpdatedFromNow, startFileWatchingProcess, stopFileWatchingProcess, isProcessing } = useFileUpload();

  onMounted(async () => {
    await startFileWatchingProcess();
  })

  onUnmounted(async () => {
    await stopFileWatchingProcess();
  })
</script>
