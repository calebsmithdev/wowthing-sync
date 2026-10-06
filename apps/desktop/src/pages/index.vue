<template>
  <div class="container py-10">
    <div class="text-center">
      <h1 class="mb-5">Addon Sync</h1>

      <div class="mb-4">
        <template v-if="lastUpdated">
          Data uploaded
          <UTooltip :text="formattedLastUpdated" :popper="{placement: 'top'}">
            {{ lastUpdatedFromNow }}
          </UTooltip>
        </template>
        <template v-else>
          Waiting to upload
        </template>
      </div>

      <p v-if="syncError" role="alert" class="mb-4 text-red-400">{{ syncError }}</p>
      <template v-if="apiKey">
        <UButton @click="handleUpload()" :loading="isProcessing" :disabled="isProcessing">Manually Upload Data</UButton>
      </template>
      <template v-else>
        <UButton to="/settings">Configure API</UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  const apiKey = useApiKeys();
  const { handleUpload, lastUpdated, lastUpdatedFromNow, isProcessing, formattedLastUpdated, syncError } = useInternalFileUpload();
</script>
