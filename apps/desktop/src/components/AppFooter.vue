<template>
  <footer class="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3 text-xs text-dimmed">
    <span class="truncate font-mono" :title="status.folder ?? undefined">{{ status.folder ?? '' }}</span>
    <span class="shrink-0">Version {{ appVersion }}</span>
  </footer>
</template>

<script setup lang="ts">
import { getVersion } from '@tauri-apps/api/app';
import { useSync } from '../composables/useSync';

const status = useSync();
const appVersion = await getVersion();
</script>
