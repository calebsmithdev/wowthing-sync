<template>
  <UAlert
    v-if="visible"
    :color="phase === 'error' ? 'error' : 'primary'"
    variant="soft"
    :title="title"
    :description="description"
    :actions="actions"
  />
</template>

<script lang="ts" setup>
import type { ButtonProps } from '@nuxt/ui'
import { open } from '@tauri-apps/plugin-shell'
import useUpdater from '../composables/useUpdater'

const { phase, visible, version, error, progress, busy, handleUpdate, checkForUpdates } = useUpdater()
const title = computed(() => ({ idle: 'Updates', checking: 'Checking for Updates', available: 'Update Available', downloading: 'Downloading Update', installing: 'Installing Update', 'up-to-date': 'You Are Up to Date', error: 'Update Failed' })[phase.value])
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
