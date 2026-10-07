import { createSettings } from '../composables/useSettings'

export default defineNuxtPlugin(async () => {
  const settings = createSettings()
  await settings.hydrate()
  return { provide: { settings } }
})
