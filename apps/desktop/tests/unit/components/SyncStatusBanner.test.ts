import { mount, flushPromises  } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { emptySyncStatus, type SyncStatus } from '../../../src/composables/useSync'
import { invoke } from '../../mocks/tauri'
import SyncStatusBanner from '../../../src/components/SyncStatusBanner.vue'

describe('sync status visible throughout navigation', () => {
  it('shows startup errors and partial failures across remounts without desktop notifications', async () => {
    const status = ref<SyncStatus>({ ...emptySyncStatus(), error: 'Configure your API key in Settings.' })
    vi.stubGlobal('useSync', () => status)
    vi.stubGlobal('ref', ref)
    const mountBanner = () => mount(SyncStatusBanner, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' }, UButton: { template: '<button><slot /></button>' } } } })
    const first = mountBanner()
    expect(first.get('[role="alert"]').text()).toContain('Configure your API key')
    invoke.mockResolvedValueOnce(null)
    await first.get('button').trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('sync_now')
    first.unmount()
    status.value.error = null
    status.value.failures = [{ file: 'account/collector.lua', message: 'HTTP 401' }]
    status.value.lastSuccess = 2
    const next = mountBanner()
    expect(next.text()).toContain('1 collector file(s) failed')
    expect(next.text()).toContain('HTTP 401')
    expect(next.get('a').text()).toBe('Open Settings')
    next.unmount()
    vi.unstubAllGlobals()
  })
})
