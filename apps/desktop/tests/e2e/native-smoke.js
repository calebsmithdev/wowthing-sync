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
      await wait(() => document.body.innerText.includes('Addon Sync') && document.body.innerText.includes('Version __SMOKE_VERSION__'))
      click('Settings')
      await wait(() => document.querySelector('input[name="apiKey"]') || document.querySelector('input[type="password"]'))
      const input = document.querySelector('input[type="password"]')
      input.value = 'smoke-fixture-key'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Save API Key' && !button.disabled))
      click('Save API Key')
      await wait(() => document.body.innerText.includes('Settings saved.'))
      click('Check for Updates')
      await wait(() => document.body.innerText.includes('You Are Up to Date'))
      click('Dashboard')
      await wait(() => document.body.innerText.includes('Manually Upload Data'))
      click('Manually Upload Data')
      await wait(() => document.body.innerText.includes('Last successful file upload'))
    } catch (error) { errors.push(String(error)) }
    await window.__TAURI_INTERNALS__.invoke('smoke_report', { errors })
  }, { once: true })
})()
