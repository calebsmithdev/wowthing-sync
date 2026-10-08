// Compiled only into integration-test binaries. Drives the real Vue UI and IPC.
(() => {
  const errors = []
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
  const wait = async predicate => {
    const deadline = Date.now() + 30000
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error(`Native integration deadline: ${document.body?.innerText}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
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
    const control = action => invoke('integration_control', { action })
    try {
      await wait(() => document.body.innerText.includes('Version __SMOKE_VERSION__'))
      click('Settings')
      await wait(() => document.body.innerText.includes('Retry Loading Settings'))
      click('Retry Loading Settings')
      await wait(() => document.body.innerText.includes('An API key is saved securely'))
      input('invalid key with spaces')
      await wait(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Save API Key' && !b.disabled))
      click('Save API Key')
      await wait(() => document.body.innerText.includes('without spaces'))
      if (document.querySelector('input[type=password]').value !== 'invalid key with spaces') throw new Error('Failed save erased draft')
      input('smoke-fixture-key')
      click('Save API Key')
      await wait(() => document.body.innerText.includes('Settings saved.'))
      await control('invalid-folder')
      click('Choose Folder')
      await wait(() => document.querySelector('#folder-message[role=alert]'))
      if (document.querySelector('input[readonly]').value.includes('not-a-wow-folder')) throw new Error('Rejected folder displayed as saved')
      await control('valid-folder')
      click('Choose Folder')
      await wait(() => document.querySelector('#folder-message[role=status]')?.textContent.includes('Settings saved.'))
      await control('write')
      await invoke('sync_now')
      await wait(async () => (await invoke('get_sync_status')).isProcessing)
      click('Status')
      await wait(() => document.body.innerText.includes('Sync Now'))
      click('Settings')
      await wait(() => document.body.innerText.includes('Save API Key'))
      click('Status')
      await wait(async () => !(await invoke('get_sync_status')).isProcessing)
      await wait(() => displayTimers.size === 1)
      await control('close')
      await wait(async () => !(await control('state')).visible)
      await wait(() => displayTimers.size === 0)
      await control('show')
      await wait(async () => (await control('state')).visible)
      await wait(() => displayTimers.size === 1)
      await control('update-failure')
      await control('tray-update')
      await wait(() => document.body.innerText.includes('Update Available'))
      click('Update')
      await wait(() => document.body.innerText.includes('Update Failed'))
      const details = document.querySelector('details')
      if (!details?.textContent.includes('Synthetic installer failure') || details.open) throw new Error('Missing collapsed updater diagnostics')
      await wait(async () => { const state = await control('state'); return state.closed === state.created })
      await control('update-success')
      click('Check Again')
      await wait(() => document.body.innerText.includes('Update Available'))
      click('Update')
      await wait(async () => (await control('state')).relaunched === 1)
    } catch (error) { errors.push(String(error)) }
    await invoke('integration_report', { errors })
  }, { once: true })
})()
