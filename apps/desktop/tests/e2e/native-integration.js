// Compiled only into integration-test binaries. No automation server.
(() => {
  const errors = []
  addEventListener('error', event => errors.push(event.message))
  addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
  addEventListener('securitypolicyviolation', event => errors.push(`CSP ${event.violatedDirective}`))
  const wait = async predicate => {
    const deadline = Date.now() + 30000
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error('Native integration deadline exceeded')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  addEventListener('DOMContentLoaded', async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke
    try {
      await wait(() => document.body.innerText.includes('Version __SMOKE_VERSION__'))
      await invoke('sync_now')
      await wait(async () => (await invoke('get_sync_status')).lastSuccess > 1767225600)
      const settings = await invoke('get_settings')
      if (!settings.hasApiKey || settings.notificationsEnabled) throw new Error('Synthetic upgrade settings did not hydrate')
    } catch (error) { errors.push(String(error)) }
    await invoke('integration_report', { errors })
  }, { once: true })
})()
