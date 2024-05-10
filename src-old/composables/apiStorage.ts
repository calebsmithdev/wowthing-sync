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
    const testValue = await saveStorageItem(API_KEY, value)
    console.log({testValue})
    setApiKey(value);
  }

  return {
    apiKey,
    setKey
  }
}