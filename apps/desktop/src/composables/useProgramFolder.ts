import { invoke } from '@tauri-apps/api/core'
import { PROGRAM_FOLDER } from '../constants'
import { getStorageItem, saveStorageItem } from '../utils/storage'

export const useProgramFolder = () => {
  const current = useState<string>('program-folder-value', () => '')
  const setFolder = async (value: string | null) => {
    if (value) current.value = await saveStorageItem(PROGRAM_FOLDER, value)
  }
  onMounted(async () => { current.value = await getStorageItem<string>(PROGRAM_FOLDER) ?? '' })
  return {
    folder: computed({ get: () => current.value, set: (value: string | null) => { void setFolder(value) } }),
    getDefaultPath: () => invoke<string>('default_wow_folder'),
  }
}
