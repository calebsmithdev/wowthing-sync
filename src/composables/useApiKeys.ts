import { API_KEY } from "~/constants";

export const useApiKeys = () => {
  const _apiKey = ref('');

  const getKey = async (): Promise<void> => {
    const value = await getStorageItem<string>(API_KEY)
    _apiKey.value = value ?? '';
  }

  const setKey = async (value: string): Promise<void> => {
    await saveStorageItem(API_KEY, value)
    _apiKey.value = value;
  }

  const apiKey = computed({
    get: () => _apiKey.value,
    set: (value: string) => setKey(value),
  });

  onMounted(() => {
    getKey();
  });

  return apiKey;
}