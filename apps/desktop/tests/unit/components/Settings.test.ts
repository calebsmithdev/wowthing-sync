import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Settings from '../../../src/pages/settings.vue'
import { createSettings, emptySettings } from '../../../src/composables/useSettings'
import { invoke } from '../../mocks/tauri'
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }))

describe('settings drafts', () => {
  it('does not persist API keystrokes or folder selection before Save', async () => {
    const settings = createSettings(); settings.loaded.value = true
    settings.state.value = { ...emptySettings(), folder: '/working', autoStart: false }
    vi.stubGlobal('useSettings', () => settings); vi.stubGlobal('useApiKeys', () => ({ hasApiKey: ref(false) }))
    vi.stubGlobal('useUpdater', () => ({ busy: ref(false), checkForUpdates: vi.fn() })); vi.stubGlobal('ref', ref)
    const wrapper = mount(Settings, { global: { stubs: {
      UFormField: { template: '<div><slot /></div>' },
      UInput: { props: ['modelValue', 'readonly', 'type'], emits: ['update:modelValue'], template: '<input :value="modelValue" :readonly="readonly" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      UButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
      UCheckbox: { template: '<div />' },
    } } })
    await wrapper.find('input').setValue('test'); await wrapper.find('input').setValue('test-key')
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValueOnce({ hasKey: true, loaded: true, error: null })
    await wrapper.findAll('button').find(button => button.text() === 'Save API Key')!.trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('save_api_key', { key: 'test-key' })
    expect(wrapper.find('input').element.value).toBe('')
    open.mockResolvedValueOnce('/new-folder')
    await wrapper.findAll('button').find(button => button.text() === 'Choose Folder')!.trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledOnce(); expect(settings.state.value.folder).toBe('/working')
    invoke.mockResolvedValueOnce({ ...emptySettings(), folder: '/canonical-folder', autoStart: false })
    await wrapper.findAll('button').find(button => button.text() === 'Save Folder')!.trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenLastCalledWith('save_sync_folder', { folder: '/new-folder' })
    expect(settings.state.value.folder).toBe('/canonical-folder'); wrapper.unmount(); vi.unstubAllGlobals()
  })
})
