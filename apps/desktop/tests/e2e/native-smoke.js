// Injected only by the smoke-test Rust feature, never in a production webview.
(() => {
  const errors = []
  addEventListener('error', event => errors.push(event.message))
  addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
  addEventListener('securitypolicyviolation', event => errors.push(`CSP ${event.violatedDirective}: ${event.blockedURI}`))
  const wait = async predicate => {
    const deadline = Date.now() + 20000
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Native UI timeout: ${document.body?.innerText}`)
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  const click = text => {
    const target = [...document.querySelectorAll('a,button')].find(node => node.textContent.trim() === text)
    if (!target) throw new Error(`Missing control: ${text}`)
    target.click()
  }
  addEventListener('DOMContentLoaded', async () => {
    try {
      await wait(() => document.body.innerText.includes('Welcome to WoWthing Sync') && document.body.innerText.includes('Version __SMOKE_VERSION__'))
      if (document.querySelector('[role=alert]') || document.body.innerText.includes('Update Failed')) throw new Error('Fresh setup was presented as an error')
      if (!document.body.innerText.includes('Copy your API key') || !document.body.innerText.includes('Select the _retail_ folder')) throw new Error('Missing setup steps')
      click('Settings')
      await wait(() => document.querySelector('input[name="apiKey"]') || document.querySelector('input[type="password"]'))
      await wait(() => document.body.innerText.includes('Updates could not be checked. You can try again here.'))
      const input = document.querySelector('input[type="password"]')
      input.value = 'smoke-fixture-key'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Save API Key' && !button.disabled))
      click('Save API Key')
      await wait(() => document.body.innerText.includes('Settings saved.'))
      click('Check for Updates')
      await wait(() => document.body.innerText.includes('You Are Up to Date'))
      click('Status')
      await wait(() => document.body.innerText.includes('API key saved securely.'))
      if (!document.body.innerText.includes('Welcome to WoWthing Sync')) throw new Error('Partial setup lost its remaining step')
      await window.__TAURI_INTERNALS__.invoke('save_sync_folder', { folder: '/fixture/_retail_' })
      await wait(() => document.body.innerText.includes('Watching 1 account'))
      click('Sync Now')
      await wait(() => document.body.innerText.includes('Synced '))
    } catch (error) { errors.push(String(error)) }
    await window.__TAURI_INTERNALS__.invoke('smoke_report', { errors })
  }, { once: true })
})()
