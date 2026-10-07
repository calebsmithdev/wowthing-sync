import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVisibleClock } from '@/composables/useVisibleClock'

const { listen, unlisten, isVisible, isMinimized } = vi.hoisted(() => ({
  listen: vi.fn(), unlisten: vi.fn(), isVisible: vi.fn(), isMinimized: vi.fn(),
}))
vi.mock('@tauri-apps/api/event', () => ({ listen }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ isVisible, isMinimized }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>(done => { resolve = done }), resolve: (value: T) => resolve(value) }
}
const mountClock = () => mount(defineComponent({ setup() {
  const clock = useVisibleClock()
  return () => h('span', String(clock.value))
} }))

describe('visible clock', () => {
  let event: (event: { payload: boolean }) => void
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(100_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    listen.mockReset().mockImplementation((_name, callback) => { event = callback; return Promise.resolve(unlisten) })
    unlisten.mockReset(); isVisible.mockReset().mockResolvedValue(true); isMinimized.mockReset().mockResolvedValue(false)
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('stops while natively hidden, resumes immediately, and cleans up', async () => {
    const wrapper = mountClock(); await flushPromises()
    await vi.advanceTimersByTimeAsync(10_000); expect(wrapper.text()).toBe('110000')
    event({ payload: false }); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000); expect(wrapper.text()).toBe('110000')
    event({ payload: true }); await flushPromises(); expect(wrapper.text()).toBe('170000')
    wrapper.unmount(); expect(unlisten).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
    event({ payload: true }); expect(vi.getTimerCount()).toBe(0)
  })
  it('honors document visibility and initially minimized windows', async () => {
    isMinimized.mockResolvedValue(true)
    const wrapper = mountClock(); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
    event({ payload: true }); expect(vi.getTimerCount()).toBe(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0)
    event({ payload: true }); expect(vi.getTimerCount()).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
  })
  it('does not let a stale snapshot restart a hidden clock', async () => {
    const snapshot = deferred<boolean>(); isVisible.mockReturnValue(snapshot.promise)
    const wrapper = mountClock(); await flushPromises()
    event({ payload: false }); snapshot.resolve(true); await flushPromises()
    expect(vi.getTimerCount()).toBe(0); wrapper.unmount()
  })
  it('cleans up a listener that resolves after unmount', async () => {
    const subscription = deferred<() => void>(); listen.mockReturnValue(subscription.promise)
    const wrapper = mountClock(); wrapper.unmount()
    subscription.resolve(unlisten); await flushPromises()
    expect(unlisten).toHaveBeenCalledOnce(); expect(isVisible).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it('uses document visibility if native IPC is unavailable', async () => {
    listen.mockRejectedValue(new Error('No native bridge'))
    const wrapper = mountClock(); await flushPromises(); expect(vi.getTimerCount()).toBe(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
})
