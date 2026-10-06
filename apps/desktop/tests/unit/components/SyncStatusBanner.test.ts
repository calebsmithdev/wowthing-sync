import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { emptySyncStatus } from '../../../src/composables/useSync'
import SyncStatusBanner from '../../../src/components/SyncStatusBanner.vue'

describe('sync status visible throughout navigation', () => {
  it('shows startup errors and partial failures across remounts without desktop notifications', () => {
    const status = ref({ ...emptySyncStatus(), error: 'Configure your API key in Settings.' })
    vi.stubGlobal('useSync', () => status)
    const mountBanner = () => mount(SyncStatusBanner, { global: { stubs: { NuxtLink: { template: '<a><slot /></a>' } } } })
    const first = mountBanner()
    expect(first.get('[role="alert"]').text()).toContain('Configure your API key')
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
