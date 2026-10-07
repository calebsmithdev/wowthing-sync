import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4187', viewport: { width: 520, height: 640 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node ../../scripts/smoke-server.mjs', env: { SMOKE_PORT: '4187' }, url: 'http://127.0.0.1:4187/__smoke/adapter.js', reuseExistingServer: false },
})
