import localforage from "localforage";

const store = localforage.createInstance({
  name: "wowthing-sync"
});

export const getStorageItem = <T>(key: string) : Promise<T> => {
  return store.getItem<T>(key);
}

export const saveStorageItem = <T>(key: string, value: T) : Promise<T> => {
  return store.setItem<T>(key, value);
}