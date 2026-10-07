import { onMounted, onUnmounted, ref } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** Stop display-only work while the native window or document is hidden. */
export function useVisibleClock() {
  const clock = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  let nativeVisible = false
  let disposed = false
  let revision = 0
  let unlisten: (() => void) | undefined
  const refresh = () => {
    clearInterval(timer)
    timer = undefined
    if (disposed || !nativeVisible || document.visibilityState === 'hidden') return
    clock.value = Date.now()
    timer = setInterval(() => { clock.value = Date.now() }, 10_000)
  }
  onMounted(async () => {
    document.addEventListener('visibilitychange', refresh)
    try {
      unlisten = await listen<boolean>('window-visibility', ({ payload }) => {
        revision++
        nativeVisible = payload
        refresh()
      })
      if (disposed) { unlisten(); return }
      const snapshotRevision = revision
      const window = getCurrentWindow()
      const [visible, minimized] = await Promise.all([window.isVisible(), window.isMinimized()])
      if (!disposed && revision === snapshotRevision) {
        nativeVisible = visible && !minimized
        refresh()
      }
    } catch {
      // Browser-only previews or unavailable IPC still follow document visibility.
      if (!disposed && revision === 0) { nativeVisible = true; refresh() }
    }
  })
  onUnmounted(() => {
    disposed = true
    clearInterval(timer)
    unlisten?.()
    document.removeEventListener('visibilitychange', refresh)
  })
  return clock
}
