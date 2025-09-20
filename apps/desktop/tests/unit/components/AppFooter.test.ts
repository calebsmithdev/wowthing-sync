import { flushPromises, mount } from '@vue/test-utils'
import { vi } from 'vitest'

import AppFooter from '@/components/AppFooter.vue'
import { getVersion } from '@tauri-apps/api/app'

describe('AppFooter', () => {
  it('renders the version returned by Tauri', async () => {
    vi.mocked(getVersion).mockResolvedValue('2.3.4')

    const wrapper = mount({
      components: { AppFooter },
      template: '<Suspense><AppFooter /></Suspense>',
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Version 2.3.4')
  })
})
