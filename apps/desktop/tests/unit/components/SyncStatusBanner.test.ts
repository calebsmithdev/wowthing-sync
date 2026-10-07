import { mount, flushPromises  } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { emptySyncStatus, type SyncStatus } from '../../../src/composables/useSync'
import { invoke } from '../../mocks/tauri'
import SyncStatusBanner from '../../../src/components/SyncStatusBanner.vue'

describe('sync status visible throughout navigation', () => {
  it('shows app-wide errors everywhere and account failures only away from Status', async () => {
    const status = ref<SyncStatus>({ ...emptySyncStatus(), error: 'Configure your API key in Settings.' })
    const route = { path: '/' }
    vi.stubGlobal('useSync', () => status)
    vi.stubGlobal('useRoute', () => route)
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('computed', computed)
    const stubs = {
      UAlert: { template: '<div><slot name="description" /></div>' },
      UButton: { props: ['to'], template: '<a v-if="to"><slot /></a><button v-else><slot /></button>' },
    }
    const mountBanner = () => mount(SyncStatusBanner, { global: { stubs } })
    const first = mountBanner()
    expect(first.get('[role="alert"]').text()).toContain('Configure your API key')
    expect(first.get('a').text()).toBe('Open Settings')
    invoke.mockResolvedValueOnce(null)
    await first.get('button').trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('sync_now')
    first.unmount()
    status.value.error = null
    status.value.failures = [{ file: '/wow/_retail_/WTF/Account/MYACCOUNT/SavedVariables/WoWthing_Collector.lua', message: 'HTTP 401' }]
    // The Status page shows the failure on the account row instead.
    expect(mountBanner().find('[role="alert"]').exists()).toBe(false)
    route.path = '/settings'
    const elsewhere = mountBanner()
    expect(elsewhere.text()).toContain('1 account failed to upload.')
    expect(elsewhere.get('a').text()).toBe('View Accounts')
    elsewhere.unmount()
    vi.unstubAllGlobals()
  })
})
