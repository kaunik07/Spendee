// expo-secure-store has no web implementation (its web module is an empty
// object — every method throws "is not a function" if called directly). This
// adapter matches expo-secure-store's API 1:1 so callers can import it as a
// drop-in replacement: native platforms delegate straight through to
// expo-secure-store, web falls back to localStorage.
//
// Note: localStorage is not encrypted at rest the way SecureStore is on
// native. That's an accepted v1 tradeoff for the web build — the same class
// of tradeoff already made for Supabase's own session storage, which uses
// AsyncStorage (also unencrypted) rather than SecureStore on Android.
import { Platform } from 'react-native';
import * as NativeSecureStore from 'expo-secure-store';

export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return NativeSecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await NativeSecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await NativeSecureStore.deleteItemAsync(key);
}
