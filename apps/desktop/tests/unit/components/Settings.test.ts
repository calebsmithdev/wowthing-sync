import { mount, flushPromises } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import Settings from '../../../src/pages/settings.vue'
import { createSettings, emptySettings } from '../../../src/composables/useSettings'
import { invoke } from '../../mocks/tauri'
const { open } = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }))

const stubs = {
  UCard: { template: '<section><slot name="header" /><slot /></section>' },
  UFormField: { template: '<div><slot name="hint" /><slot /></div>' },
  UInput: { props: ['modelValue', 'readonly', 'type'], emits: ['update:modelValue'], template: '<input :value="modelValue" :readonly="readonly" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  USwitch: { template: '<div />' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UAlert: { template: '<div />' },
}

const mountSettings = () => {
  const settings = createSettings(); settings.loaded.value = true
  settings.state.value = { ...emptySettings(), folder: '/working/_retail_', autoStart: false }
  vi.stubGlobal('useSettings', () => settings); vi.stubGlobal('useApiKeys', () => ({ hasApiKey: ref(false) }))
  vi.stubGlobal('useUpdater', () => ({ busy: ref(false), checkForUpdates: vi.fn() })); vi.stubGlobal('ref', ref); vi.stubGlobal('computed', computed)
  return { settings, wrapper: mount(Settings, { global: { stubs } }) }
}
const button = (wrapper: ReturnType<typeof mountSettings>['wrapper'], text: string) => wrapper.findAll('button').find(node => node.text() === text)!

describe('settings', () => {
  it('does not persist API keystrokes before Save and clears the draft after saving', async () => {
    const { wrapper } = mountSettings()
    const input = wrapper.find('input[type="password"]')
    await input.setValue('test'); await input.setValue('test-key')
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValueOnce({ hasKey: true, loaded: true, error: null })
    await button(wrapper, 'Save API Key').trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledExactlyOnceWith('save_api_key', { key: 'test-key' })
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('[role="status"]').text()).toBe('Settings saved.')
    invoke.mockResolvedValueOnce({ hasKey: true, loaded: true, error: null })
    await input.setValue('enter-key'); await input.trigger('keydown.enter'); await flushPromises()
    expect(invoke).toHaveBeenLastCalledWith('save_api_key', { key: 'enter-key' })
    wrapper.unmount(); vi.unstubAllGlobals()
  })

  it('saves a folder chosen in the OS dialog and shows failures beside the folder', async () => {
    const { settings, wrapper } = mountSettings()
    open.mockResolvedValueOnce(null)
    await button(wrapper, 'Choose Folder').trigger('click'); await flushPromises()
    expect(invoke).not.toHaveBeenCalled()
    invoke.mockResolvedValueOnce({ ...emptySettings(), folder: '/canonical/_retail_', autoStart: false })
    open.mockResolvedValueOnce('/new/_retail_')
    await button(wrapper, 'Choose Folder').trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenLastCalledWith('save_sync_folder', { folder: '/new/_retail_' })
    expect(settings.state.value.folder).toBe('/canonical/_retail_')
    expect((wrapper.find('input[readonly]').element as HTMLInputElement).value).toBe('/canonical/_retail_')
    // Re-selecting an unchanged path explicitly approves a fresh directory capability.
    invoke.mockRejectedValueOnce('No collector files found.').mockResolvedValueOnce({ ...settings.state.value })
    open.mockResolvedValueOnce('/canonical/_classic_')
    await button(wrapper, 'Choose Folder').trigger('click'); await flushPromises()
    expect(invoke).toHaveBeenCalledWith('save_sync_folder', { folder: '/canonical/_classic_' })
    expect(wrapper.get('[role="alert"]').text()).toBe('No collector files found.')
    expect(settings.state.value.folder).toBe('/canonical/_retail_')
    wrapper.unmount(); vi.unstubAllGlobals()
  })

  it('warns when the saved folder is not the retail game folder', async () => {
    const { settings, wrapper } = mountSettings()
    expect(wrapper.text()).not.toContain('not "_retail_"')
    settings.state.value = { ...settings.state.value, folder: 'C:\\Games\\World of Warcraft\\_classic_' }
    await flushPromises()
    expect(wrapper.text()).toContain('This folder is "_classic_", not "_retail_"')
    wrapper.unmount(); vi.unstubAllGlobals()
  })
})
