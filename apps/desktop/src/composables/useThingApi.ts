import { invoke } from '@tauri-apps/api/core'

export async function submitAddonData(filePath: string): Promise<string> {
  return await invoke<string>('submit_addon_data', { filePath })
}
