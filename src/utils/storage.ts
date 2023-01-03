export const getStorageItem = async <T>(key: string) : Promise<T> => {
  const Store = (await import('tauri-plugin-store-api')).Store
  const store = new Store('.settings.dat');
  return await store.get(key);
}

export const saveStorageItem = async <T>(key: string, value: T) : Promise<T> => {
  const Store = (await import('tauri-plugin-store-api')).Store
  const store = new Store('.settings.dat');
  await store.set(key, value);
  return await store.get(key);
}