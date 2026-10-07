import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const version = readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8').match(/^version = "([^"]+)"/m)![1]

test('built UI saves explicit drafts, keeps sync across navigation and reveals update state', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('https://**', route => route.abort()) // Hermetic: no external API, icon CDN or updater.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Addon Sync' })).toBeVisible()
  await expect(page.getByText(`Version ${version}`)).toBeVisible()
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
  await page.getByRole('button', { name: 'Choose Folder' }).click()
  await page.getByRole('button', { name: 'Save Folder' }).click()
  await page.getByRole('button', { name: 'Check for Updates', exact: true }).click()
  await expect(page.getByText('You Are Up to Date', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    const fixture = (window as unknown as { __SMOKE__: { emit: (event: string, payload: unknown) => void; status: object } }).__SMOKE__
    fixture.emit('sync-status', { ...fixture.status, failures: [{ file: 'fixture.lua', message: 'HTTP 401' }] })
  })
  await expect(page.getByRole('alert').filter({ hasText: 'HTTP 401' })).toBeVisible()
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'HTTP 401' })).toBeVisible()
  await page.getByRole('button', { name: 'Manually Upload Data' }).click()
  await expect(page.getByText('Last successful file upload')).toBeVisible()
  expect(errors).toEqual([])
  await page.screenshot({ path: process.env.SMOKE_SCREENSHOT ?? test.info().outputPath('dashboard.png') })
})
