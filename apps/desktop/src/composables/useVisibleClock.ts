import { onMounted, onUnmounted, ref } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** Stop display-only work while the native window or document is hidden. */
export function useVisibleClock() {
  const clock = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  let nativeVisible = false
  let hasNativeEvidence = false
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
  const reconcileNativeVisibility = async () => {
    const snapshotRevision = ++revision
    try {
      const window = getCurrentWindow()
      const [visible, minimized] = await Promise.all([window.isVisible(), window.isMinimized()])
      if (!disposed && revision === snapshotRevision) {
        hasNativeEvidence = true
        nativeVisible = visible && !minimized
        refresh()
      }
    } catch {
      // Document transitions invalidate queries, but only native evidence disables fallback.
      if (!disposed && revision === snapshotRevision && !hasNativeEvidence) {
        nativeVisible = true
        refresh()
      }
    }
  }
  const onVisibilityChange = () => {
    if (disposed) return
    revision++
    refresh()
    // WebKit can become visible after restore's native focus/resize events.
    // Reconcile once so a transient native false cannot leave the clock stopped.
    if (document.visibilityState !== 'hidden') void reconcileNativeVisibility()
  }
  onMounted(async () => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    try {
      unlisten = await listen<boolean>('window-visibility', ({ payload }) => {
        revision++
        hasNativeEvidence = true
        nativeVisible = payload
        refresh()
      })
      if (disposed) { unlisten(); return }
      await reconcileNativeVisibility()
    } catch {
      // Browser-only previews or unavailable IPC still follow document visibility.
      if (!disposed && !hasNativeEvidence) { nativeVisible = true; refresh() }
    }
  })
  onUnmounted(() => {
    disposed = true
    clearInterval(timer)
    unlisten?.()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
  return clock
}
