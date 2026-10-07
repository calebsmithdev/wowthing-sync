<template>
  <UAlert
    v-if="visible"
    :color="phase === 'error' ? 'error' : phase === 'up-to-date' ? 'success' : 'primary'"
    variant="soft"
    :icon="icon"
    :title="title"
    :description="description"
    :actions="actions"
    :close="!busy"
    @update:open="isOpen => { if (!isOpen) dismiss() }"
  />
</template>

<script lang="ts" setup>
import type { ButtonProps } from '@nuxt/ui'
import { open } from '@tauri-apps/plugin-shell'
import useUpdater from '../composables/useUpdater'

const { phase, visible, version, error, progress, busy, handleUpdate, checkForUpdates, dismiss } = useUpdater()
const title = computed(() => ({ idle: 'Updates', checking: 'Checking for Updates', available: 'Update Available', downloading: 'Downloading Update', installing: 'Installing Update', 'up-to-date': 'You Are Up to Date', error: 'Update Failed' })[phase.value])
const icon = computed(() => phase.value === 'error' ? 'i-lucide-circle-alert' : phase.value === 'up-to-date' ? 'i-lucide-circle-check' : busy.value ? 'i-lucide-loader-circle' : 'i-lucide-info')
const description = computed(() => {
  if (error.value) return error.value
  if (phase.value === 'available') return `Version ${version.value} is ready to install.`
  if (phase.value === 'downloading') return progress.value === null ? 'Downloading…' : `${progress.value}% downloaded`
  if (phase.value === 'installing') return 'Installing the update. The app will restart when ready.'
  if (phase.value === 'up-to-date') return 'You have the latest available version.'
  return 'Please wait…'
})
const openDownload = async () => {
  try { await open('https://github.com/calebsmithdev/wowthing-sync/releases/latest') }
  catch (cause) { error.value = String(cause); phase.value = 'error' }
}
const actions = computed<ButtonProps[]>(() => phase.value === 'available' ? [
  { variant: 'solid', color: 'primary', label: 'Update', disabled: busy.value, onClick: () => handleUpdate() },
  { variant: 'outline', color: 'primary', label: 'Download', onClick: openDownload },
] : phase.value === 'error' ? [
  { label: 'Check Again', onClick: () => checkForUpdates(true) },
] : [])
</script>
