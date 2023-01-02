import localforage from "localforage";

const store = localforage.createInstance({
  name: "wowthings-sync"
});

export const getStorageItem = <T>(key: string) : Promise<T> => {
  return localforage.getItem<T>(key);
}

export const saveStorageItem = <T>(key: string, value: T) : Promise<T> => {
  return localforage.setItem<T>(key, value);
}