// Served only by the smoke server; never included in packaged frontend assets.
(() => {
  let sequence = 0
  const callbacks = new Map()
  const listeners = new Map()
  const calls = []
  const onboarding = new URLSearchParams(location.search).has('onboarding')
  const settings = { folder: onboarding ? null : '/fixture/_retail_', hasApiKey: !onboarding, autoStart: false, autoStartError: null, notificationsEnabled: false, notificationPermission: 'unknown' }
  const status = { folder: settings.folder, hasApiKey: !onboarding, files: onboarding ? [] : ['/fixture/collector.lua'], isProcessing: false, lastSuccess: null, error: null, pending: 0, failures: [], warning: null, uploads: {} }
  const emit = (event, payload) => {
    for (const listener of listeners.values()) if (listener.event === event) callbacks.get(listener.handler)?.({ event, id: listener.id, payload })
  }
  const fixture = { calls, settings, status, emit, updaterError: onboarding ? 'error sending request for url https://example.invalid/latest.json' : null }
  window.__SMOKE__ = fixture
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener(_event, id) {
      const listener = listeners.get(id)
      if (listener) callbacks.delete(listener.handler)
      listeners.delete(id)
    },
  }
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
    transformCallback(callback, once = false) {
      const id = ++sequence
      callbacks.set(id, (...args) => { if (once) callbacks.delete(id); callback(...args) })
      return id
    },
    unregisterCallback(id) { callbacks.delete(id) },
    convertFileSrc: path => path,
    async invoke(command, args = {}) {
      calls.push({ command, args })
      switch (command) {
        case 'plugin:event|listen': {
          const id = ++sequence
          listeners.set(id, { id, event: args.event, handler: args.handler })
          return id
        }
        case 'plugin:event|unlisten': listeners.delete(args.eventId); return null
        case 'plugin:window|is_visible': return true
        case 'plugin:window|is_minimized': return false
        case 'plugin:app|version': return '__SMOKE_VERSION__'
        case 'plugin:updater|check': if (fixture.updaterError) throw new Error(fixture.updaterError); return null
        case 'get_settings': return { ...settings }
        case 'get_sync_status': return { ...status }
        case 'default_wow_folder': return '/fixture/_retail_'
        case 'plugin:dialog|open': return onboarding ? '/fixture/_retail_' : '/fixture/new_retail_'
        case 'save_api_key': {
          if (!args.key.trim() || args.key.includes('invalid')) throw new Error('API key is invalid')
          settings.hasApiKey = status.hasApiKey = true
          emit('sync-status', { ...status })
          return { hasKey: true, error: null }
        }
        case 'save_sync_folder': settings.folder = status.folder = args.folder; status.files = ['/fixture/collector.lua']; emit('sync-status', { ...status }); return { ...settings }
        case 'set_autostart': settings.autoStart = args.enabled; return { ...settings }
        case 'set_notifications': settings.notificationsEnabled = args.enabled; return { ...settings }
        case 'sync_now': status.lastSuccess = 1791244800; status.uploads = { '/fixture/collector.lua': 1791244800 }; emit('sync-status', { ...status }); return null
        default: throw new Error(`Unsupported hermetic command: ${command}`)
      }
    },
  }
})()
