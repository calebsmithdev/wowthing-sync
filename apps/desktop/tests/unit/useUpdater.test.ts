import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import useUpdater from '@/composables/useUpdater'

const { mockEmit, mockListen, mockCheck, mockRelaunch } = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockListen: vi.fn(),
  mockCheck: vi.fn(),
  mockRelaunch: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  emit: mockEmit,
  listen: mockListen,
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: mockCheck,
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: mockRelaunch,
}))

describe('useUpdater', () => {
  let registeredListener: ((payload: unknown) => void) | undefined

  const mountComposable = async () => {
    const component = defineComponent({
      name: 'TestUpdaterConsumer',
      setup() {
        return useUpdater()
      },
      template: '<div />',
    })

    const wrapper = mount(component)
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    vi.useFakeTimers()

    registeredListener = undefined

    mockEmit.mockReset()
    mockCheck.mockReset()
    mockListen.mockReset()
    mockRelaunch.mockReset()

    mockListen.mockImplementation((_event, handler) => {
      registeredListener = handler
      return Promise.resolve(vi.fn())
    })

    mockRelaunch.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('marks updateNeeded when check resolves with an update on mount', async () => {
    mockCheck.mockResolvedValueOnce({ downloadAndInstall: vi.fn() })

    const wrapper = await mountComposable()

    expect(mockCheck).toHaveBeenCalledTimes(1)
    expect(wrapper.vm.updateNeeded).toBe(true)

    wrapper.unmount()
  })

  it('downloads the update and relaunches the app when handleUpdate is invoked', async () => {
    mockCheck.mockResolvedValueOnce(null)

    const downloadAndInstall = vi.fn().mockImplementation(async (progressHandler?: (payload: any) => void) => {
      if (progressHandler) {
        progressHandler({ event: 'Started', data: { contentLength: 100 } })
        progressHandler({ event: 'Progress', data: { chunkLength: 50 } })
        progressHandler({ event: 'Finished', data: {} })
      }
    })

    mockCheck.mockResolvedValueOnce({ downloadAndInstall })

    const wrapper = await mountComposable()

    expect(wrapper.vm.updateNeeded).toBe(false)

    await wrapper.vm.handleUpdate()

    expect(downloadAndInstall).toHaveBeenCalledTimes(1)
    expect(mockRelaunch).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('flags updateNeeded when the tauri update event fires', async () => {
    mockCheck.mockResolvedValueOnce(null)

    const wrapper = await mountComposable()

    expect(mockListen).toHaveBeenCalledWith('tauri://update-available', expect.any(Function))
    expect(wrapper.vm.updateNeeded).toBe(false)

    registeredListener?.({})
    await nextTick()

    expect(wrapper.vm.updateNeeded).toBe(true)

    wrapper.unmount()
  })
})
