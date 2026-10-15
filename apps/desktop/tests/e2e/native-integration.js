// Compiled only into integration-test binaries. Drives the real Vue UI and IPC.
(() => {
  const errors = []
  const started = Date.now()
  const waits = []
  let nativeState
  const diagnostics = () => ({ waits, elapsedMs: Date.now() - started, visibility: document.visibilityState, displayTimers: displayTimers.size, nativeState })
  // Observe display-clock lifetime without exposing diagnostics in production UI.
  const displayTimers = new Set()
  const setInterval = window.setInterval.bind(window)
  const clearInterval = window.clearInterval.bind(window)
  window.setInterval = (callback, delay, ...args) => {
    const id = setInterval(callback, delay, ...args)
    if (delay === 10000) displayTimers.add(id)
    return id
  }
  window.clearInterval = id => { displayTimers.delete(id); clearInterval(id) }
  addEventListener('error', event => errors.push(event.message))
  addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
  addEventListener('securitypolicyviolation', event => errors.push(`CSP ${event.violatedDirective}`))
  const wait = async (phase, predicate) => {
    const entry = { phase, startedMs: Date.now() - started, visibility: document.visibilityState, displayTimers: displayTimers.size }
    waits.push(entry)
    const deadline = Date.now() + 30000
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error(`Native integration deadline (${phase}): ${document.body?.innerText}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    entry.durationMs = Date.now() - started - entry.startedMs
    entry.finishedVisibility = document.visibilityState
    entry.finishedDisplayTimers = displayTimers.size
  }
  const click = text => {
    const node = [...document.querySelectorAll('a,button')].find(node => node.textContent.trim() === text && !node.disabled)
    if (!node) throw new Error(`Missing enabled control: ${text}`)
    node.click()
  }
  const input = value => {
    const node = document.querySelector('input[type=password]')
    node.value = value
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }
  addEventListener('DOMContentLoaded', async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke
    const control = async action => { nativeState = await invoke('integration_control', { action }); return nativeState }
    try {
      await control('login-startup')
      await wait('login startup manually revealed', async () => (await control('state')).visible)
      await wait('app ready', () => document.body.innerText.includes('Version __SMOKE_VERSION__'))
      click('Settings')
      await wait('hydration failure', () => document.body.innerText.includes('Retry Loading Settings'))
      click('Retry Loading Settings')
      await wait('hydration retry', () => document.body.innerText.includes('An API key is saved securely'))
      input('invalid key with spaces')
      await wait('key draft ready', () => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save API Key' && !b.disabled))
      click('Save API Key')
      await wait('invalid key rejected', () => document.body.innerText.includes('without spaces'))
      if (document.querySelector('input[type=password]').value !== 'invalid key with spaces') throw new Error('Failed save erased draft')
      input('smoke-fixture-key')
      click('Save API Key')
      await wait('key saved', () => document.body.innerText.includes('Settings saved.'))
      await control('invalid-folder')
      click('Choose Folder')
      await wait('invalid folder rejected', () => document.querySelector('#folder-message[role=alert]'))
      if (document.querySelector('input[readonly]').value.includes('not-a-wow-folder')) throw new Error('Rejected folder displayed as saved')
      await control('valid-folder')
      click('Choose Folder')
      await wait('folder saved', () => document.querySelector('#folder-message[role=status]')?.textContent.includes('Settings saved.'))
      await control('write')
      await invoke('sync_now')
      await wait('upload started', async () => (await invoke('get_sync_status')).isProcessing)
      click('Status')
      await wait('Status navigation', () => document.body.innerText.includes('Sync Now'))
      click('Settings')
      await wait('Settings navigation', () => document.body.innerText.includes('Save API Key'))
      click('Status')
      await wait('upload finished', async () => !(await invoke('get_sync_status')).isProcessing)
      const capabilities = await control('state')
      // On macOS, the native visibility event can stop the clock before WebKit
      // processes the hide. Finish both transitions before reversing direction.
      const waitForClock = (phase, running) => wait(phase, () =>
        displayTimers.size === (running ? 1 : 0)
        && (!capabilities.runEventSupported || document.visibilityState === (running ? 'visible' : 'hidden')))
      await waitForClock('initial display clock', true)
      await control('close')
      await wait('tray close hidden', async () => !(await control('state')).visible)
      await waitForClock('tray close clock stopped', false)
      await control('show')
      await wait('tray reopen visible', async () => (await control('state')).visible)
      await waitForClock('tray reopen clock resumed', true)
      // A previous hidden observation must not satisfy a new recovery request.
      let visibleRequestRejected = false
      try { await control('second-instance') } catch (error) {
        if (!String(error).includes('currently hidden')) throw error
        visibleRequestRejected = true
      }
      if (!visibleRequestRejected) throw new Error('Second-instance fixture accepted a visible window')
      await control('close')
      await wait('second-instance close hidden', async () => !(await control('state')).visible)
      await waitForClock('second-instance clock stopped', false)
      await control('autostart-second-instance')
      await new Promise(resolve => setTimeout(resolve, 250))
      await control('confirm-autostart-hidden')
      if (displayTimers.size !== 0) throw new Error('Marked instance restarted the display clock')
      await control('second-instance')
      await wait('second-instance visible', async () => (await control('state')).visible)
      await waitForClock('second-instance clock resumed', true)
      if (capabilities.runEventSupported) {
        await control('close')
        await wait('Reopen close hidden', async () => !(await control('state')).visible)
        await waitForClock('Reopen clock stopped', false)
        await control('run-event-reopen')
        await wait('Reopen visible', async () => (await control('state')).visible)
        await waitForClock('Reopen clock resumed', true)
      }
      if (capabilities.minimizeSupported) {
        await control('minimize')
        await wait('native minimized', async () => (await control('state')).minimized)
        await waitForClock('minimized clock stopped', false)
        await control('restore-minimized')
        await wait('native restored', async () => {
          const state = await control('state')
          return state.visible && !state.minimized
        })
        await waitForClock('restored clock resumed', true)
      }
      await control('update-failure')
      await control('tray-update')
      await wait('tray update available', () => document.body.innerText.includes('Update Available'))
      click('Update')
      await wait('update install failed', () => document.body.innerText.includes('Update Failed'))
      const details = document.querySelector('details')
      if (!details?.textContent.includes('Synthetic installer failure') || details.open) throw new Error('Missing collapsed updater diagnostics')
      await wait('failed update resource closed', async () => { const state = await control('state'); return state.closed === state.created })
      await control('update-success')
      click('Check Again')
      await wait('retry update available', () => document.body.innerText.includes('Update Available'))
      click('Update')
      await wait('updater relaunched', async () => (await control('state')).relaunched === 1)
    } catch (error) { errors.push(String(error)) }
    await invoke('integration_report', { errors, diagnostics: diagnostics() })
  }, { once: true })
})()
