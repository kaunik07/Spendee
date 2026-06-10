import AsyncStorage from '@react-native-async-storage/async-storage';

export type StorageMode = 'local' | 'online';

const KEY = '@spendee_storage_mode';

export async function getStorageMode(): Promise<StorageMode | null> {
  const val = await AsyncStorage.getItem(KEY);
  return (val as StorageMode) ?? null;
}

export async function setStorageMode(mode: StorageMode): Promise<void> {
  await AsyncStorage.setItem(KEY, mode);
}
