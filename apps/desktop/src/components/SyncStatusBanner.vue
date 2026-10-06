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
    <NuxtLink to="/settings" class="underline">Open Settings</NuxtLink>
  </div>
</template>

<script setup lang="ts">
const status = useSync()
</script>
