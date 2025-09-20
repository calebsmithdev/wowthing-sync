import { vi } from 'vitest'

export const invoke = vi.fn()
export const getVersion = vi.fn().mockResolvedValue('0.0.0')

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion,
}))
