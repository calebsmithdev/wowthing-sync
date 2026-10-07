import { flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Update, type DownloadEvent } from '@tauri-apps/plugin-updater'
import { createUpdater } from '@/composables/useUpdater'

const { mockListen, mockCheck, mockRelaunch, mockUnlisten } = vi.hoisted(() => ({ mockListen: vi.fn(), mockCheck: vi.fn(), mockRelaunch: vi.fn(), mockUnlisten: vi.fn() }))
vi.unmock('@tauri-apps/api/core')
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }))
vi.mock('@tauri-apps/plugin-updater', async original => ({ ...await original<typeof import('@tauri-apps/plugin-updater')>(), check: mockCheck }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mockRelaunch }))
function createUpdate() {
  const update = new Update({ rid: 1, currentVersion: '1.0.7', version: '1.0.8', rawJson: {} })
  return { update, close: vi.spyOn(update, 'close').mockResolvedValue(undefined), downloadAndInstall: vi.spyOn(update, 'downloadAndInstall').mockResolvedValue(undefined) }
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const CHECK_INTERVAL_MS = 5 * 60 * 1000

describe('shared updater controller', () => {
  let listener: ((event: { payload: { source: 'tray' } }) => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers(); listener = undefined
    mockCheck.mockReset().mockResolvedValue(null)
    mockListen.mockReset().mockImplementation((_event, callback) => { listener = callback; return Promise.resolve(mockUnlisten) })
    mockRelaunch.mockReset().mockResolvedValue(undefined); mockUnlisten.mockReset()
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('closes check resources and polls without overlapping', async () => {
    const first = createUpdate(); const second = createUpdate()
    mockCheck.mockResolvedValueOnce(first.update).mockResolvedValueOnce(second.update)
    const updater = createUpdater(); updater.start(); await flushPromises()
    expect(updater.phase.value).toBe('available'); expect(first.close).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(second.close).toHaveBeenCalledOnce(); expect(first.downloadAndInstall).not.toHaveBeenCalled(); updater.stop()
  })
  it('shows download progress and closes before relaunch', async () => {
    const resource = createUpdate(); mockCheck.mockResolvedValueOnce(resource.update)
    const updater = createUpdater()
    resource.downloadAndInstall.mockImplementation(async (callback?: (event: DownloadEvent) => void) => {
      callback?.({ event: 'Started', data: { contentLength: 100 } }); callback?.({ event: 'Progress', data: { chunkLength: 50 } })
      expect(updater.progress.value).toBe(50); expect(updater.phase.value).toBe('downloading')
      callback?.({ event: 'Finished' }); expect(updater.phase.value).toBe('installing')
    })
    await updater.handleUpdate()
    expect(resource.close).toHaveBeenCalledOnce(); expect(mockRelaunch).toHaveBeenCalledOnce()
    expect(resource.close.mock.invocationCallOrder[0]).toBeLessThan(mockRelaunch.mock.invocationCallOrder[0]); updater.stop()
  })
  it('closes after failed install and exposes the error without relaunch', async () => {
    const resource = createUpdate(); resource.downloadAndInstall.mockRejectedValueOnce(new Error('Download failed'))
    mockCheck.mockResolvedValueOnce(resource.update); const updater = createUpdater(); await updater.handleUpdate()
    expect(updater.phase.value).toBe('error'); expect(updater.error.value).toContain('Download failed')
    expect(resource.close).toHaveBeenCalledOnce(); expect(mockRelaunch).not.toHaveBeenCalled(); updater.stop()
  })
  it('does not relaunch if resource cleanup fails', async () => {
    const resource = createUpdate(); resource.close.mockRejectedValueOnce(new Error('Close failed'))
    mockCheck.mockResolvedValueOnce(resource.update); const updater = createUpdater(); await updater.handleUpdate()
    expect(updater.error.value).toContain('Close failed'); expect(mockRelaunch).not.toHaveBeenCalled(); updater.stop()
  })
  it('coalesces duplicate install and manual check while busy', async () => {
    const pending = deferred<void>(); const resource = createUpdate(); resource.downloadAndInstall.mockReturnValueOnce(pending.promise)
    mockCheck.mockResolvedValueOnce(resource.update); const updater = createUpdater()
    const first = updater.handleUpdate(); const duplicate = updater.handleUpdate(); const check = updater.checkForUpdates()
    await flushPromises(); expect(mockCheck).toHaveBeenCalledOnce(); expect(resource.downloadAndInstall).toHaveBeenCalledOnce()
    pending.resolve(); await Promise.all([first, duplicate, check]); expect(mockRelaunch).toHaveBeenCalledOnce(); updater.stop()
  })
  it('keeps Update disabled until asynchronous check cleanup releases the lock', async () => {
    const closing = deferred<void>(); const resource = createUpdate(); resource.close.mockReturnValueOnce(closing.promise)
    mockCheck.mockResolvedValueOnce(resource.update); const updater = createUpdater(); const checking = updater.checkForUpdates()
    await flushPromises(); expect(updater.phase.value).toBe('available'); expect(updater.busy.value).toBe(true)
    closing.resolve(); await checking; expect(updater.busy.value).toBe(false)
    const install = createUpdate(); mockCheck.mockResolvedValueOnce(install.update); await updater.handleUpdate()
    expect(install.downloadAndInstall).toHaveBeenCalledOnce(); updater.stop()
  })
  it('reveals an up-to-date result from a typed tray event', async () => {
    const updater = createUpdater(); updater.start(); await flushPromises()
    expect(updater.visible.value).toBe(false); expect(mockListen).toHaveBeenCalledWith('check-for-updates', expect.any(Function))
    listener?.({ payload: { source: 'tray' } }); await flushPromises()
    expect(updater.visible.value).toBe(true); expect(updater.phase.value).toBe('up-to-date'); updater.stop()
  })
  it('recovers from background check errors', async () => {
    const resource = createUpdate(); mockCheck.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(resource.update)
    const updater = createUpdater(); updater.start(); await flushPromises(); expect(updater.error.value).toContain('Offline')
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); expect(updater.phase.value).toBe('available'); expect(updater.error.value).toBeNull(); updater.stop()
  })
  it('closes a late check result without installing or changing disposed state', async () => {
    const pending = deferred<Update>(); const resource = createUpdate(); mockCheck.mockReturnValueOnce(pending.promise)
    const updater = createUpdater(); const operation = updater.handleUpdate(); updater.stop(); pending.resolve(resource.update); await operation
    expect(resource.close).toHaveBeenCalledOnce(); expect(resource.downloadAndInstall).not.toHaveBeenCalled(); expect(mockRelaunch).not.toHaveBeenCalled()
  })
  it('does not relaunch after teardown during download', async () => {
    const pending = deferred<void>(); const resource = createUpdate(); mockCheck.mockResolvedValueOnce(resource.update); resource.downloadAndInstall.mockReturnValueOnce(pending.promise)
    const updater = createUpdater(); const operation = updater.handleUpdate(); await flushPromises(); updater.stop(); pending.resolve(); await operation
    expect(resource.close).toHaveBeenCalledOnce(); expect(mockRelaunch).not.toHaveBeenCalled()
  })
  it('cleans up late listeners and stops polling', async () => {
    const pending = deferred<() => void>(); mockListen.mockReturnValueOnce(pending.promise)
    const updater = createUpdater(); updater.start(); updater.stop(); pending.resolve(mockUnlisten); await flushPromises()
    expect(mockUnlisten).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS); expect(mockCheck).toHaveBeenCalledOnce()
  })
})
