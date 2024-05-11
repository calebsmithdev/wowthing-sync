<template>
  <UAlert v-if="updateNeeded"
    color="primary"
    :ui="{rounded: ''}"
    variant="soft"
    title="Update Available"
    description="Click the button below to update to the latest version."
    :actions="[{ variant: 'solid', color: 'primary', label: 'Update', click: handleUpdate }, { variant: 'outline', color: 'primary', label: 'Download', click: () => handleOpenUrl('https://github.com/calebsmithdev/wowthing-sync/releases/latest') }]"
  />
</template>

<script lang="ts" setup>
import { open } from '@tauri-apps/api/shell';
const { updateNeeded, handleUpdate } = useUpdater();

const handleOpenUrl = (url: string) => {
  open(url);
};
</script>

<style scoped>
a {
  cursor: pointer;
  text-decoration: underline;
}
</style>