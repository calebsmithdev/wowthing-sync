import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import UpdateBanner from '../../../src/components/UpdateBanner.vue'
import type { ButtonProps } from '@nuxt/ui'
const { open } = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/plugin-shell', () => ({ open }))

// UAlert spreads Nuxt UI ButtonProps onto buttons; its installed contract is onClick.
const Alert = defineComponent({
  props: { actions: Array, title: String, description: String },
  setup: props => () => h('div', [h('p', props.title), h('p', props.description), ...(props.actions as ButtonProps[]).map(action => h('button', { onClick: action.onClick }, action.label))]),
})
import { h } from 'vue'

describe('UpdateBanner action buttons', () => {
  it('clicks Update and Download through Nuxt UI onClick props', async () => {
    const handleUpdate = vi.fn(); const phase = ref('available')
    vi.stubGlobal('computed', computed)
    vi.stubGlobal('useNuxtApp', () => ({ $updater: { phase, visible: ref(true), version: ref('1.0.8'), error: ref(null), progress: ref(null), busy: ref(false), handleUpdate, checkForUpdates: vi.fn() } }))
    const wrapper = mount(UpdateBanner, { global: { stubs: { UAlert: Alert } } })
    const buttons = wrapper.findAll('button')
    await buttons[0].trigger('click'); expect(handleUpdate).toHaveBeenCalledOnce()
    await buttons[1].trigger('click'); await flushPromises()
    expect(open).toHaveBeenCalledExactlyOnceWith('https://github.com/calebsmithdev/wowthing-sync/releases/latest')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
})
