import { createUpdater } from '../composables/useUpdater'

export default defineNuxtPlugin((nuxtApp) => {
  const updater = createUpdater()
  nuxtApp.vueApp.onUnmount(updater.stop)
  import.meta.hot?.dispose(updater.stop)
  updater.start()
  return { provide: { updater } }
})
