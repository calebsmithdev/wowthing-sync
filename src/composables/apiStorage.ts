import { useEffect, useState } from 'react'
import { API_KEY } from '../constants';
import { getStorageItem, saveStorageItem } from '../utils/storage';

export const useApiKeys = () => {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    getKey();
  }, []);

  const getKey = async () => {
    const value = await getStorageItem<string>(API_KEY)
    setApiKey(value);
  }

  const setKey = async (value) => {
    await saveStorageItem(API_KEY, value)
    setApiKey(value);
  }

  return {
    apiKey,
    setKey
  }
}