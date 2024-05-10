<template>
  <div class="container pt-5">
    <h1 class="mb-5">Settings</h1>

    <UCheckbox label="Launch WoWthing Sync when you start your computer" v-model="autoStart" class="mb-6" />

    <UFormGroup label="API Key" name="apiKey" help="Visit Settings -> Account to find your API Key." class="mb-6">
      <UInput v-model="apiKey" autocomplete="off" :ui="{ icon: { trailing: { pointer: '' } } }" :type="showPassword ? 'text' : 'password'">
        <template #trailing>
          <UButton
            color="gray"
            variant="link"
            :icon="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
            :padded="false"
            @click="toggleShowPassword"
          />
        </template>
      </UInput>
    </UFormGroup>

    <UFormGroup label='World of Warcraft "_retail_" Folder' name="folder">
      <UInput v-model="folder" readonly @click="openFolderDialog">
        <template #trailing>
          <span class="text-gray-500 dark:text-gray-400 text-xs">Choose Directory</span>
        </template>
      </UInput>
    </UFormGroup>
  </div>
</template>

<script setup lang="ts">
  import { open } from '@tauri-apps/api/dialog';
  import { enable, isEnabled, disable } from "tauri-plugin-autostart-api";

  const apiKey = useApiKeys();
  const autoStart = useAutoStart();
  const { handleUpload, lastUpdated, lastUpdatedFromNow, startFileWatchingProcess, stopFileWatchingProcess, isProcessing } = useFileUpload();
  const { folder, getDefaultPath } = useProgramFolder();
  const showPassword = ref(false);

  const openFolderDialog = async () => {
    const defaultPath = await getDefaultPath();
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultPath,
    });
    folder.value = Array.isArray(selected) ? selected[0] : selected;
  }

  const toggleShowPassword = () => {
    showPassword.value = !showPassword.value;
  }
</script>