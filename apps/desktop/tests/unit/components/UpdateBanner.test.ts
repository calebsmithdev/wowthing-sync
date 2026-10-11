import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, ref, h  } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import UpdateBanner from '../../../src/components/UpdateBanner.vue'
import type { ButtonProps } from '@nuxt/ui'
const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl }))

// UAlert spreads Nuxt UI ButtonProps onto buttons; its installed contract is onClick.
const Alert = defineComponent({
  props: { actions: Array, title: String, description: String },
  setup: (props, { slots }) => () => h('div', [h('p', props.title), slots.description?.() ?? h('p', props.description), ...(props.actions as ButtonProps[]).map(action => h('button', { onClick: action.onClick }, action.label))]),
})

describe('UpdateBanner action buttons', () => {
  it('clicks Update and Download through Nuxt UI onClick props', async () => {
    const handleUpdate = vi.fn(); const phase = ref('available')
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useNuxtApp', () => ({ $updater: { phase, visible: ref(true), version: ref('1.0.8'), error: ref(null), errorOperation: ref(null), progress: ref(null), busy: ref(false), handleUpdate, checkForUpdates: vi.fn() } }))
    const wrapper = mount(UpdateBanner, { global: { stubs: { UAlert: Alert } } })
    const buttons = wrapper.findAll('button')
    await buttons[0]!.trigger('click'); expect(handleUpdate).toHaveBeenCalledOnce()
    await buttons[1]!.trigger('click'); await flushPromises()
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com/calebsmithdev/wowthing-sync/releases/latest')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
  it('explains check and install failures with collapsed diagnostic details and a working retry', async () => {
    const errorOperation = ref('check'); const checkForUpdates = vi.fn()
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useNuxtApp', () => ({ $updater: { phase: ref('error'), visible: ref(true), version: ref(null), error: ref('error sending request for url https://example.invalid/latest.json'), errorOperation, progress: ref(null), busy: ref(false), handleUpdate: vi.fn(), checkForUpdates } }))
    const wrapper = mount(UpdateBanner, { global: { stubs: { UAlert: Alert } } })
    expect(wrapper.text()).toContain('Could Not Check for Updates')
    expect(wrapper.text()).toContain('Syncing can continue.')
    expect(wrapper.get('details').element.open).toBe(false)
    expect(wrapper.get('details').text()).toContain('example.invalid')
    await wrapper.get('button').trigger('click')
    expect(checkForUpdates).toHaveBeenCalledExactlyOnceWith(true)
    errorOperation.value = 'install'; await flushPromises()
    expect(wrapper.text()).toContain('Update Failed')
    expect(wrapper.text()).toContain('The update could not be completed.')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
  it('asks for a reinstall when macOS could not restore the previous app', async () => {
    openUrl.mockClear()
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useNuxtApp', () => ({ $updater: { phase: ref('error'), visible: ref(true), version: ref(null), error: ref('failed to install the update and to restore the previous app, which was left at /Applications/Wowthing Sync (previous version).app'), errorOperation: ref('install'), progress: ref(null), busy: ref(false), handleUpdate: vi.fn(), checkForUpdates: vi.fn() } }))
    const wrapper = mount(UpdateBanner, { global: { stubs: { UAlert: Alert } } })
    expect(wrapper.text()).toContain('Reinstall Needed')
    expect(wrapper.text()).toContain('Download the latest version to reinstall.')
    expect(wrapper.get('details').text()).toContain('(previous version).app')
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(openUrl).toHaveBeenCalledExactlyOnceWith('https://github.com/calebsmithdev/wowthing-sync/releases/latest')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
})
