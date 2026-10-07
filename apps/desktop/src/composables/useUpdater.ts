import { computed, ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

const CHECK_INTERVAL_MS = 5 * 60 * 1000
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'up-to-date' | 'error'
export interface UpdateCheckRequest { source: 'tray' }

/** One controller per Nuxt app; checking, tray requests and installation share its lock. */
export function createUpdater() {
  const phase = ref<UpdatePhase>('idle')
  const visible = ref(false)
  const version = ref<string | null>(null)
  const error = ref<string | null>(null)
  const progress = ref<number | null>(null)
  const busy = ref(false)
  let disposed = false
  let started = false
  let operation: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let unlisten: UnlistenFn | undefined
  const setPhase = (value: UpdatePhase) => { if (!disposed) phase.value = value }
  const schedule = () => {
    clearTimeout(timer)
    if (!disposed && started) timer = setTimeout(() => { void checkForUpdates(false) }, CHECK_INTERVAL_MS)
  }
  const run = (install: boolean, manual: boolean): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (manual) visible.value = true
    if (operation) return operation
    clearTimeout(timer)
    error.value = null
    progress.value = null
    setPhase('checking')
    busy.value = true
    operation = (async () => {
      // Keep explicit try/finally. `await using` breaks older system webviews.
      const update = await check()
      if (!update) { setPhase('up-to-date'); return }
      try {
        if (disposed) return
        version.value = update.version
        visible.value = true
        if (!install) { setPhase('available'); return }
        setPhase('downloading')
        let downloaded = 0
        let total = 0
        await update.downloadAndInstall(event => {
          if (disposed) return
          if (event.event === 'Started') total = event.data.contentLength ?? 0
          if (event.event === 'Progress') {
            downloaded += event.data.chunkLength
            progress.value = total > 0 ? Math.min(100, Math.round(downloaded / total * 100)) : null
          }
          if (event.event === 'Finished') { progress.value = 100; setPhase('installing') }
        })
      } finally {
        await update.close()
      }
      if (!disposed) await relaunch()
    })().catch(cause => {
      if (!disposed) { error.value = String(cause); visible.value = true; phase.value = 'error' }
    }).finally(() => {
      operation = undefined
      busy.value = false
      schedule()
    })
    return operation
  }
  const checkForUpdates = (manual = true) => run(false, manual)
  const handleUpdate = () => run(true, true)
  const start = () => {
    if (started || disposed) return
    started = true
    void listen<UpdateCheckRequest>('check-for-updates', event => {
      if (event.payload.source === 'tray') void checkForUpdates(true)
    }).then(stop => { if (disposed) stop(); else unlisten = stop }).catch(cause => {
      if (!disposed) { error.value = `Cannot listen for tray update requests: ${String(cause)}`; visible.value = true; phase.value = 'error' }
    })
    void checkForUpdates(false)
  }
  const stop = () => { disposed = true; clearTimeout(timer); unlisten?.() }
  return { phase, visible, version, error, progress, busy, updateNeeded: computed(() => phase.value === 'available'), checkForUpdates, handleUpdate, start, stop }
}
export type UpdaterController = ReturnType<typeof createUpdater>
export default function useUpdater(): UpdaterController { return useNuxtApp().$updater }
