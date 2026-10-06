import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Update, type DownloadEvent } from '@tauri-apps/plugin-updater'

import useUpdater from '@/composables/useUpdater'

const { mockListen, mockCheck, mockRelaunch, mockUnlisten } = vi.hoisted(() => ({
  mockListen: vi.fn(),
  mockCheck: vi.fn(),
  mockRelaunch: vi.fn(),
  mockUnlisten: vi.fn(),
}))

// Exercise Resource's real Symbol.asyncDispose implementation through Update.
vi.unmock('@tauri-apps/api/core')
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }))
vi.mock('@tauri-apps/plugin-updater', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tauri-apps/plugin-updater')>(),
  check: mockCheck,
}))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mockRelaunch }))

function createUpdate() {
  const update = new Update({
    rid: 1,
    currentVersion: '1.0.7',
    version: '1.0.8',
    rawJson: {},
  })
  const close = vi.spyOn(update, 'close').mockResolvedValue(undefined)
  const downloadAndInstall = vi.spyOn(update, 'downloadAndInstall').mockResolvedValue(undefined)
  return { update, close, downloadAndInstall }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000

describe('useUpdater', () => {
  let registeredListener: (() => void) | undefined

  const mountComposable = () => mount(defineComponent({
    setup: () => useUpdater(),
    template: '<div />',
  }))

  beforeEach(() => {
    vi.useFakeTimers()
    registeredListener = undefined
    mockCheck.mockReset().mockResolvedValue(null)
    mockListen.mockReset().mockImplementation((_event, handler) => {
      registeredListener = handler
      return Promise.resolve(mockUnlisten)
    })
    mockRelaunch.mockReset().mockResolvedValue(undefined)
    mockUnlisten.mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('closes each available update after checking on mount and while polling', async () => {
    const first = createUpdate()
    const second = createUpdate()
    mockCheck.mockResolvedValueOnce(first.update).mockResolvedValueOnce(second.update)
    const wrapper = mountComposable()
    await flushPromises()

    expect(wrapper.vm.updateNeeded).toBe(true)
    expect(first.close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(second.close).toHaveBeenCalledTimes(1)
    expect(first.downloadAndInstall).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('disposes an installed update before relaunching', async () => {
    const resource = createUpdate()
    const wrapper = mountComposable()
    await flushPromises()
    resource.downloadAndInstall.mockImplementation(async (onEvent?: (event: DownloadEvent) => void) => {
      onEvent?.({ event: 'Started', data: { contentLength: 100 } })
      onEvent?.({ event: 'Progress', data: { chunkLength: 100 } })
      onEvent?.({ event: 'Finished' })
    })
    mockCheck.mockResolvedValueOnce(resource.update)

    await wrapper.vm.handleUpdate()

    expect(resource.downloadAndInstall).toHaveBeenCalledTimes(1)
    expect(resource.close).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)
    expect(resource.close.mock.invocationCallOrder[0]).toBeLessThan(mockRelaunch.mock.invocationCallOrder[0])
    wrapper.unmount()
  })

  it('disposes an update when installation fails and does not relaunch', async () => {
    const resource = createUpdate()
    const wrapper = mountComposable()
    await flushPromises()
    resource.downloadAndInstall.mockRejectedValueOnce(new Error('Download failed'))
    mockCheck.mockResolvedValueOnce(resource.update)

    await expect(wrapper.vm.handleUpdate()).rejects.toThrow('Download failed')
    expect(resource.close).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('handles no available update without relaunching', async () => {
    const wrapper = mountComposable()
    await flushPromises()
    await wrapper.vm.handleUpdate()
    expect(wrapper.vm.updateNeeded).toBe(false)
    expect(mockRelaunch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('recovers after a failed background check', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resource = createUpdate()
    mockCheck.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(resource.update)
    const wrapper = mountComposable()
    await flushPromises()
    expect(logError).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(wrapper.vm.updateNeeded).toBe(true)
    expect(resource.close).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not overlap slow checks and disposes a result arriving after unmount', async () => {
    const pending = deferred<Update>()
    const resource = createUpdate()
    mockCheck.mockReturnValueOnce(pending.promise)
    const wrapper = mountComposable()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2)
    expect(mockCheck).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    pending.resolve(resource.update)
    await flushPromises()
    expect(resource.close).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.updateNeeded).toBe(false)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(mockCheck).toHaveBeenCalledTimes(1)
  })

  it('stops polling and removes its event listener on unmount', async () => {
    const wrapper = mountComposable()
    await flushPromises()
    registeredListener?.()
    await nextTick()
    expect(wrapper.vm.updateNeeded).toBe(true)
    wrapper.unmount()
    expect(mockUnlisten).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(mockCheck).toHaveBeenCalledTimes(1)
  })

  it('removes an event listener registered after unmount', async () => {
    const pending = deferred<() => void>()
    mockListen.mockReturnValueOnce(pending.promise)
    const wrapper = mountComposable()
    wrapper.unmount()
    pending.resolve(mockUnlisten)
    await flushPromises()
    expect(mockUnlisten).toHaveBeenCalledTimes(1)
  })
})
