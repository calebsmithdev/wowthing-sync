import { describe, expect, it } from 'vitest'
import { invoke } from '../mocks/tauri'
import { createSettings, emptySettings } from '../../src/composables/useSettings'

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

describe('typed shared settings', () => {
  it('hydrates once for concurrent consumers', async () => {
    const pending = deferred<ReturnType<typeof emptySettings>>()
    invoke.mockReturnValueOnce(pending.promise)
    const settings = createSettings(); const first = settings.hydrate(); const second = settings.hydrate()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_settings')
    pending.resolve({ ...emptySettings(), autoStart: true }); await Promise.all([first, second])
    await settings.hydrate(); expect(invoke).toHaveBeenCalledOnce(); expect(settings.state.value.autoStart).toBe(true)
  })
  it('clears a bridge load error after a successful explicit retry', async () => {
    invoke.mockRejectedValueOnce(new Error('bridge unavailable')).mockResolvedValueOnce({ ...emptySettings(), folder: '/recovered' })
    const settings = createSettings()
    await settings.hydrate()
    expect(settings.loaded.value).toBe(false); expect(settings.loading.value).toBe(false)
    expect(settings.error.value).toContain('bridge unavailable')
    await settings.hydrate(true)
    expect(settings.loaded.value).toBe(true); expect(settings.error.value).toBeNull()
    expect(settings.state.value.folder).toBe('/recovered')
  })
  it('retains working settings and reconciles actual OS state after save failure', async () => {
    const settings = createSettings(); settings.state.value.folder = '/working'
    invoke.mockRejectedValueOnce(new Error('Invalid folder')).mockResolvedValueOnce({ ...emptySettings(), folder: '/working', autoStart: false })
    expect(await settings.saveFolder('/invalid')).toBe(false)
    expect(settings.state.value.folder).toBe('/working'); expect(settings.saving.value).toBeNull(); expect(settings.error.value).toContain('Invalid folder')
    expect(invoke).toHaveBeenNthCalledWith(1, 'save_sync_folder', { folder: '/invalid' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'get_settings')
  })
  it('uses explicit secure saving and prevents overlapping writes', async () => {
    const pending = deferred<{ hasKey: boolean; loaded: boolean; error: string | null }>()
    invoke.mockReturnValueOnce(pending.promise)
    const settings = createSettings(); const saving = settings.saveKey(' test-key ')
    expect(settings.saving.value).toBe('api-key'); expect(await settings.setAutostart(true)).toBe(false)
    expect(invoke).toHaveBeenCalledExactlyOnceWith('save_api_key', { key: ' test-key ' })
    pending.resolve({ hasKey: true, loaded: true, error: null }); expect(await saving).toBe(true)
    expect(settings.state.value.hasApiKey).toBe(true); expect(settings.saving.value).toBeNull()
  })
  it('reports secure-save cleanup warnings while reflecting committed presence', async () => {
    invoke.mockResolvedValueOnce({ hasKey: true, loaded: true, error: 'Legacy cleanup failed' })
    const settings = createSettings(); expect(await settings.saveKey('fixture')).toBe(true)
    expect(settings.state.value.hasApiKey).toBe(true); expect(settings.error.value).toBe('Legacy cleanup failed')
  })
})
