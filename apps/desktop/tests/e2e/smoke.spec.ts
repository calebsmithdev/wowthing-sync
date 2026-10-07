import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const version = readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8').match(/^version = "([^"]+)"/m)![1]

test('built UI saves explicit drafts, keeps sync across navigation and reveals update state', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('https://**', route => route.abort()) // Hermetic: no external API, icon CDN or updater.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Not synced yet' })).toBeVisible()
  await expect(page.getByText(`Version ${version}`)).toBeVisible()
  await expect(page.getByText('Watching 1 account for changes')).toBeVisible()
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByRole('textbox', { name: 'API Key', exact: true }).fill('smoke-fixture-key')
  const count = () => page.evaluate(() => (window as unknown as { __SMOKE__: { calls: { command: string }[] } }).__SMOKE__.calls.filter(call => call.command === 'save_api_key').length)
  expect(await count()).toBe(0)
  await page.getByRole('button', { name: 'Save API Key', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved.' })).toBeVisible()
  expect(await count()).toBe(1)
  await page.getByRole('textbox', { name: 'API Key', exact: true }).fill('invalid')
  await page.getByRole('button', { name: 'Save API Key', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'API key is invalid' })).toBeVisible()
  const folders = () => page.evaluate(() => (window as unknown as { __SMOKE__: { calls: { command: string; args: { folder?: string } }[] } }).__SMOKE__.calls.filter(call => call.command === 'save_sync_folder').map(call => call.args.folder))
  await page.getByRole('button', { name: 'Choose Folder' }).click()
  await expect(page.locator('#folder-message[role=status]')).toHaveText('Settings saved.')
  expect(await folders()).toEqual(['/fixture/new_retail_'])
  await expect(page.getByText('This folder is "new_retail_", not "_retail_"')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('settings.png'), fullPage: true })
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click()
  await expect(page.getByText('You Are Up to Date', { exact: true })).toBeVisible()
  await expect(page.getByText('You Are Up to Date', { exact: true })).toBeHidden({ timeout: 6000 })
  await page.evaluate(() => {
    const fixture = (window as unknown as { __SMOKE__: { emit: (event: string, payload: unknown) => void; status: object } }).__SMOKE__
    fixture.emit('sync-status', { ...fixture.status, failures: [{ file: 'fixture.lua', message: 'HTTP 401' }] })
  })
  await expect(page.getByRole('alert').filter({ hasText: '1 account failed to upload.' })).toBeVisible()
  await page.getByRole('link', { name: 'View Accounts' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Failed · HTTP 401' })).toBeVisible()
  await expect(page.getByText('1 account needs attention')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sync Now' }).click()
  await expect(page.getByRole('heading', { name: /^Synced / })).toBeVisible()
  await page.evaluate(() => {
    const fixture = (window as unknown as { __SMOKE__: { emit: (event: string, payload: unknown) => void; status: object } }).__SMOKE__
    fixture.emit('sync-status', { ...fixture.status, failures: [] })
  })
  await expect(page.getByRole('listitem').filter({ hasText: 'collector.lua' })).toContainText('ago')
  expect(errors).toEqual([])
  await page.screenshot({ path: process.env.SMOKE_SCREENSHOT ?? test.info().outputPath('dashboard.png') })
})
