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
  let reject!: (reason: Error) => void
  return {
    promise: new Promise<T>((done, fail) => { resolve = done; reject = fail }),
    resolve: (value: T) => resolve(value), reject: (reason: Error) => reject(reason),
  }
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
    isMinimized.mockResolvedValue(false)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises(); expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
  })
  it('rechecks cached native false when the document becomes visible after restore', async () => {
    const wrapper = mountClock(); await flushPromises()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    event({ payload: true }); event({ payload: false })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(isVisible).toHaveBeenCalledTimes(2); expect(isMinimized).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toBe('160000'); expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(10_000); expect(wrapper.text()).toBe('170000')
    expect(isVisible).toHaveBeenCalledTimes(2)
    wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['hidden', 'minimized'] as const)('keeps a natively %s window stopped even if the document reports visible', async (state) => {
    isVisible.mockResolvedValue(state !== 'hidden'); isMinimized.mockResolvedValue(state === 'minimized')
    const wrapper = mountClock(); await flushPromises()
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
    expect(isVisible).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it('ignores out-of-order document visibility snapshots', async () => {
    const wrapper = mountClock(); await flushPromises()
    const stale = deferred<boolean>(); const latest = deferred<boolean>()
    isVisible.mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    latest.resolve(false); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
    stale.resolve(true); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
  it('does not let a stale false snapshot stop a newly revealed clock', async () => {
    const wrapper = mountClock(); await flushPromises()
    const snapshot = deferred<boolean>(); isVisible.mockReturnValue(snapshot.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    event({ payload: true }); snapshot.resolve(false); await flushPromises()
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
  })
  it('preserves native hidden state when a document reconciliation fails', async () => {
    isVisible.mockResolvedValue(false)
    const wrapper = mountClock(); await flushPromises()
    isVisible.mockRejectedValue(new Error('Native snapshot unavailable'))
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
  it.each(['native hide', 'document hide', 'unmount'] as const)('invalidates a pending reconciliation on %s', async (change) => {
    const wrapper = mountClock(); await flushPromises()
    const snapshot = deferred<boolean>(); isVisible.mockReturnValue(snapshot.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    if (change === 'native hide') event({ payload: false })
    else if (change === 'document hide') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    } else wrapper.unmount()
    snapshot.resolve(true); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
    if (change !== 'unmount') wrapper.unmount()
    expect(unlisten).toHaveBeenCalledOnce()
    const queries = isVisible.mock.calls.length
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(isVisible).toHaveBeenCalledTimes(queries); expect(vi.getTimerCount()).toBe(0)
  })
  it('does not cache a pending visible snapshot across a document hide', async () => {
    isVisible.mockResolvedValue(false)
    const wrapper = mountClock(); await flushPromises()
    const stale = deferred<boolean>(); const latest = deferred<boolean>()
    isVisible.mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    stale.resolve(true); await flushPromises()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(vi.getTimerCount()).toBe(0)
    latest.resolve(false); await flushPromises(); expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
  it.each(['initial first', 'reconciliation first'] as const)('falls back after initial and restored snapshots fail (%s)', async (order) => {
    const initial = deferred<boolean>(); const restored = deferred<boolean>()
    isVisible.mockReturnValueOnce(initial.promise).mockReturnValueOnce(restored.promise)
    const wrapper = mountClock(); await flushPromises()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    const failures = order === 'initial first' ? [initial, restored] : [restored, initial]
    for (const snapshot of failures) {
      snapshot.reject(new Error('Native snapshot unavailable')); await flushPromises()
    }
    expect(wrapper.text()).toBe('160000'); expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(10_000); expect(wrapper.text()).toBe('170000')
    expect(isVisible).toHaveBeenCalledTimes(2)
    wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('does not fall back after native hide evidence during a failed initial snapshot', async () => {
    const initial = deferred<boolean>(); isVisible.mockReturnValueOnce(initial.promise)
    const wrapper = mountClock(); await flushPromises()
    event({ payload: false })
    initial.reject(new Error('Native snapshot unavailable')); await flushPromises()
    isVisible.mockRejectedValue(new Error('Native snapshot unavailable'))
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
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
  it('retains document fallback if listener setup fails after a document transition', async () => {
    const subscription = deferred<() => void>(); listen.mockReturnValue(subscription.promise)
    isVisible.mockRejectedValue(new Error('No native bridge'))
    const wrapper = mountClock()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    subscription.reject(new Error('No native bridge')); await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount(); expect(vi.getTimerCount()).toBe(0)
  })
  it('uses document visibility if native IPC is unavailable', async () => {
    listen.mockRejectedValue(new Error('No native bridge'))
    const wrapper = mountClock(); await flushPromises(); expect(vi.getTimerCount()).toBe(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(0)
    wrapper.unmount()
  })
})
