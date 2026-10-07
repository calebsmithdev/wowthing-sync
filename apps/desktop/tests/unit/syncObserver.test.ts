import { describe, expect, it, vi } from 'vitest'
import { invoke } from '../mocks/tauri'
import { emptySyncStatus } from '../../src/composables/useSync'
import { observeSync } from '../../src/utils/syncObserver'
const { listen, unlisten } = vi.hoisted(() => ({ listen: vi.fn(), unlisten: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen }))

describe('app lifetime sync observer', () => {
  it('keeps a live event over an older initialization snapshot', async () => {
    const event = { ...emptySyncStatus(), folder: '/new' }
    listen.mockImplementation(async (_name, callback) => { callback({ payload: event }); return unlisten })
    invoke.mockResolvedValue(emptySyncStatus())
    const update = vi.fn()
    const stop = await observeSync(update)
    expect(update).toHaveBeenCalledExactlyOnceWith(event)
    stop()
    expect(unlisten).toHaveBeenCalledOnce()
  })
  it('closes its listener if the initial status command fails', async () => {
    listen.mockResolvedValue(unlisten)
    invoke.mockRejectedValue(new Error('bridge unavailable'))
    await expect(observeSync(vi.fn())).rejects.toThrow('bridge unavailable')
    expect(unlisten).toHaveBeenCalledOnce()
  })
})
