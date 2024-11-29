import { load } from '@tauri-apps/plugin-store';

export const getStore = async () => {
  return await load('.settings.dat')
}

export const getStorageItem = async <T>(key: string) : Promise<T> => {
  const store = await getStore();
  return await store.get<T>(key);
}

export const saveStorageItem = async <T>(key: string, value: T) : Promise<T> => {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
  return await store.get<T>(key);
}
