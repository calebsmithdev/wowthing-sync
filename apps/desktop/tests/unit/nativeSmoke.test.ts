import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import smoke from '../e2e/native-smoke.js?raw'

it('native smoke waits for each rendered opener retry to become idle before continuing', async () => {
  vi.useFakeTimers()
  const calls: string[] = []
  let finishRetry: (() => void) | undefined
  let start: (() => Promise<void>) | undefined
  const report = vi.fn()
  document.body.innerHTML = `
    <p id="state">Welcome to WoWthing Sync Version __SMOKE_VERSION__ Copy your API key Select the _retail_ folder</p>
    <button>Settings</button><input type="password" name="apiKey">
    <p>Updates could not be checked. You can try again here.</p>
    <a aria-disabled="false">Failcookie</a><a aria-disabled="false">WoWthing</a>
    <p id="error"></p><button id="retry" hidden></button>
    <button id="logs">Open Logs Folder</button><p id="logs-error"></p>
    <button>Save API Key</button><button>Check for Updates</button><button>Status</button><button>Sync Now</button>`
  // jsdom has no layout-backed innerText; this fixture only needs rendered text.
  Object.defineProperty(document.body, 'innerText', { configurable: true, get: () => document.body.textContent })
  const state = document.querySelector('#state')!
  const error = document.querySelector('#error')!
  const retry = document.querySelector<HTMLButtonElement>('#retry')!
  const links = [...document.querySelectorAll('a')]
  const setBusy = (busy: boolean) => links.forEach(link => link.setAttribute('aria-disabled', String(busy)))
  for (const link of links) {
    link.onclick = () => {
      if (link.getAttribute('aria-disabled') === 'true') return
      const name = link.textContent!
      calls.push(name)
      error.textContent = `Could not open ${name} in your browser`
      retry.textContent = `Retry Opening ${name}`
      retry.hidden = false
      retry.onclick = () => {
        calls.push(name)
        setBusy(true)
        error.textContent = ''
        retry.hidden = true
        finishRetry = () => { setBusy(false) }
      }
    }
  }
  let logAttempts = 0
  document.querySelector('#logs')!.addEventListener('click', () => {
    document.querySelector('#logs-error')!.textContent = logAttempts++ === 0 ? 'Could not open the logs folder. Try again.' : ''
  })
  for (const button of document.querySelectorAll('button:not(#retry):not(#logs)')) {
    button.addEventListener('click', () => {
      const messages: Record<string, string> = {
        'Save API Key': 'Settings saved.',
        'Check for Updates': 'You Are Up to Date',
        'Status': 'Welcome to WoWthing Sync API key saved.',
        'Sync Now': 'Synced just now',
      }
      state.textContent = messages[button.textContent!] ?? state.textContent
    })
  }
  try {
    runInNewContext(smoke, {
      document, Event, Date, setTimeout,
      addEventListener: (name: string, callback: () => Promise<void>) => { if (name === 'DOMContentLoaded') start = callback },
      window: { __TAURI_INTERNALS__: { invoke: async (command: string, args: unknown) => {
        if (command === 'save_sync_folder') state.textContent = 'Watching 1 account'
        if (command === 'smoke_report') report(args)
      } } },
    })
    const completed = start!()
    for (const name of ['Failcookie', 'WoWthing']) {
      await vi.advanceTimersByTimeAsync(200)
      expect(calls).toEqual(name === 'Failcookie' ? [name, name] : ['Failcookie', 'Failcookie', name, name])
      expect(error.textContent).toBe('')
      expect(links.every(link => link.getAttribute('aria-disabled') === 'true')).toBe(true)
      expect(report).not.toHaveBeenCalled()
      finishRetry!()
    }
    await vi.advanceTimersByTimeAsync(200)
    await completed
    expect(report).toHaveBeenCalledExactlyOnceWith({ errors: [] })
    expect(calls).toEqual(['Failcookie', 'Failcookie', 'WoWthing', 'WoWthing'])
    expect(logAttempts).toBe(2)
  } finally {
    vi.useRealTimers()
    delete (document.body as Partial<HTMLElement>).innerText
    document.body.innerHTML = ''
  }
})
