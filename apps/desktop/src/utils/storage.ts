import { invoke } from '@tauri-apps/api/core'

/** Only allowlisted non-secret preferences are exposed by Rust. */
export const getStorageItem = <T>(key: string): Promise<T | null> => invoke('get_preference', { key })
export const saveStorageItem = <T>(key: string, value: T): Promise<T> => invoke('save_preference', { key, value })
