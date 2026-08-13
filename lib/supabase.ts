import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Use AsyncStorage for Supabase session — SecureStore has a 2048-byte limit
// on Android which silently drops JWT tokens (they exceed the limit), causing
// Android to lose its session on every app restart.
//
// On web, Expo Router's static output prerenders each route once in Node
// (no `window`) before hydrating in the browser. AsyncStorage's web
// implementation reads `window.localStorage` directly and throws outside a
// browser, crashing that prerender pass. `window` is *also* undefined on
// native (Hermes/JSC have no DOM), where that's normal and AsyncStorage's
// native module works regardless — so the SSR case must be detected as
// "web platform, but no window", not just "no window".
const isWebSSR = Platform.OS === 'web' && typeof window === 'undefined';
const noopStorage = {
  getItem:    async () => null,
  setItem:    async () => {},
  removeItem: async () => {},
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage:            isWebSSR ? noopStorage : AsyncStorage,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
    },
  }
);
