import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { emptySyncStatus, type SyncStatus } from '../../../src/composables/useSync'
import StatusPage from '../../../src/pages/index.vue'

const ACCOUNT = (name: string) => `/wow/_retail_/WTF/Account/${name}/SavedVariables/WoWthing_Collector.lua`

const mountStatus = (value: Partial<SyncStatus>) => {
  const status = ref<SyncStatus>({ ...emptySyncStatus(), hasApiKey: true, folder: '/wow/_retail_', ...value })
  vi.stubGlobal('useSync', () => status)
  vi.stubGlobal('useApiKeys', () => ({ hasApiKey: computed(() => status.value.hasApiKey) }))
  vi.stubGlobal('useInternalFileUpload', () => ({
    handleUpload: vi.fn(), isProcessing: computed(() => status.value.isProcessing),
    lastUpdated: computed(() => status.value.lastSuccess), lastUpdatedFromNow: computed(() => 'a minute ago'),
    formattedLastUpdated: computed(() => ''), fromNow: (unix: number) => `at ${unix}`, formatted: String,
  }))
  vi.stubGlobal('ref', ref); vi.stubGlobal('computed', computed); vi.stubGlobal('onUnmounted', () => {})
  return mount(StatusPage, { global: { stubs: { UButton: { template: '<button><slot /></button>' }, UIcon: { template: '<i />' } } } })
}

describe('status page', () => {
  it('lists every account with its own upload time or failure', () => {
    const wrapper = mountStatus({
      lastSuccess: 5,
      files: [ACCOUNT('MAIN'), ACCOUNT('ALT'), ACCOUNT('NEW')],
      uploads: { [ACCOUNT('MAIN')]: 5, [ACCOUNT('ALT')]: 3 },
      failures: [{ file: ACCOUNT('ALT'), message: 'HTTP 401' }, { file: ACCOUNT('UNREADABLE'), message: 'Permission denied' }],
    })
    expect(wrapper.get('h1').text()).toBe('Synced a minute ago')
    expect(wrapper.text()).toContain('2 accounts need attention')
    const rows = wrapper.findAll('li').map(row => row.findAll(':scope > span').map(cell => cell.text().replace(/\s+/g, ' ')).join(' | '))
    expect(rows).toEqual(['MAIN | at 5', 'ALT | Failed · HTTP 401Retry', 'NEW | Not uploaded yet', 'UNREADABLE | Failed · Permission deniedRetry'])
    wrapper.unmount(); vi.unstubAllGlobals()
  })

  it('asks for setup before showing sync state', () => {
    const wrapper = mountStatus({ hasApiKey: false, folder: null })
    expect(wrapper.get('h1').text()).toBe('Welcome to WoWthing Sync')
    expect(wrapper.text()).toContain('Copy your API key from WoWthing Settings → Account.')
    expect(wrapper.text()).toContain('Select the _retail_ folder that contains WTF/Account.')
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Open Settings'])
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    wrapper.unmount(); vi.unstubAllGlobals()
  })
  it.each([
    { hasApiKey: true, folder: null, complete: 'API key saved securely.', remaining: 'Select the _retail_ folder' },
    { hasApiKey: false, folder: '/wow/_retail_', complete: 'World of Warcraft folder selected.', remaining: 'Copy your API key' },
  ])('marks completed setup steps and keeps the remaining step actionable', value => {
    const wrapper = mountStatus(value)
    expect(wrapper.get('h1').text()).toBe('Welcome to WoWthing Sync')
    expect(wrapper.findAll('[aria-label=Complete]')).toHaveLength(1)
    expect(wrapper.text()).toContain(value.complete)
    expect(wrapper.text()).toContain(value.remaining)
    expect(wrapper.text()).not.toContain('Accounts')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
})
