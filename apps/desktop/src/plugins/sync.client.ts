import { useSync } from '../composables/useSync'
import { observeSync } from '../utils/syncObserver'

export default defineNuxtPlugin(async (nuxtApp) => {
  const status = useSync()
  let disposed = false
  let unlisten: (() => void) | undefined
  const dispose = () => { disposed = true; unlisten?.() }
  nuxtApp.vueApp.onUnmount(dispose)
  import.meta.hot?.dispose(dispose)
  try {
    unlisten = await observeSync(value => { if (!disposed) status.value = value })
    if (disposed) unlisten()
  } catch (error) {
    if (!disposed) status.value.error = String(error)
  }
})
