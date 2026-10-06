<template>
  <div class="space-y-6">
    <h1>Settings</h1>

    <UFormField
      label="API Key"
      name="apiKey"
      help="Visit Settings -> Account to find your API Key."
      class="w-full"
    >
      <UInput
        v-model="apiKey"
        autocomplete="off"
        class="w-full"
        :ui="{ trailing: 'pointer-events-auto' }"
        :type="showPassword ? 'text' : 'password'"
      >
        <template #trailing>
          <UButton
            color="neutral"
            variant="link"
            :icon="showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
            class="cursor-pointer p-0"
            @click="toggleShowPassword"
          />
        </template>
      </UInput>
    </UFormField>
    <p class="text-sm">{{ hasApiKey ? "An API key is saved securely. Enter a key to replace it." : "No API key is saved." }}</p>
    <UButton :loading="savingKey" :disabled="!apiKey.trim() || savingKey" @click="saveKeyDraft">Save API Key</UButton>
    <p v-if="keyError" role="alert" class="text-red-400">{{ keyError }}</p>

    <UFormField
      label='World of Warcraft "_retail_" Folder'
      name="folder"
      class="w-full"
    >
      <UInput
        v-model="folder"
        readonly
        class="w-full"
        :ui="{
          root: 'cursor-pointer',
          base: 'cursor-pointer select-none',
          trailing: 'cursor-pointer pointer-events-auto text-right'
        }"
        @click="openFolderDialog"
      >
        <template #trailing>
          <span
            class="text-gray-500 dark:text-gray-400 text-xs cursor-pointer"
            @click.stop="openFolderDialog"
          >
            Choose Directory
          </span>
        </template>
      </UInput>
    </UFormField>

    <div class="space-y-3">
      <UCheckbox
        label="Enable desktop notifications"
        v-model="notificationsEnabled"
        class="w-full justify-start"
      />

      <UCheckbox
        label="Launch WoWthing Sync when you start your computer"
        v-model="autoStart"
        class="w-full justify-start"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';

  const { hasApiKey, saveKey } = useApiKeys();
  const apiKey = ref('');
  const savingKey = ref(false);
  const keyError = ref<string | null>(null);
  const saveKeyDraft = async () => {
    savingKey.value = true; keyError.value = null;
    try { const saved = await saveKey(apiKey.value); apiKey.value = ''; keyError.value = saved.error }
    catch (error) { keyError.value = String(error) }
    finally { savingKey.value = false }
  };
  const autoStart = useAutoStart();
  const { folder, getDefaultPath } = useProgramFolder();
  const showPassword = ref(false);
  const { notificationsEnabled } = useNotifications();

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
