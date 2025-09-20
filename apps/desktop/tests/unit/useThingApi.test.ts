import { vi } from 'vitest'

import { submitAddonData } from '@/composables/useThingApi'
import { invoke } from '@tauri-apps/api/core'

describe('submitAddonData', () => {
  it('delegates to tauri invoke with the expected payload', async () => {
    vi.mocked(invoke).mockResolvedValue('ok')

    const result = await submitAddonData('/tmp/foo.lua')

    expect(invoke).toHaveBeenCalledWith('submit_addon_data', { filePath: '/tmp/foo.lua' })
    expect(result).toBe('ok')
  })
})
