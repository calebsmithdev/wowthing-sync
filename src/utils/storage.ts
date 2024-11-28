import { load } from '@tauri-apps/plugin-store';

const store = await load('.settings.dat');

export const getStorageItem = async <T>(key: string) : Promise<T> => {
  return await store.get<T>(key);
}

export const saveStorageItem = async <T>(key: string, value: T) : Promise<T> => {
  await store.set(key, value);
  await store.save();
  return await store.get<T>(key);
}
