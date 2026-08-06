import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// A random id generated once per install and persisted, sent as a header on
// every /api/coach request so the server can enforce per-device daily caps
// that a client-side counter alone can't guarantee (that counter is reset by
// just reinstalling or clearing storage — this id would be too, but the
// server-side count it's keyed to can't be tampered with from the device).
const STORAGE_KEY = 'visiongo-device-id';

let cached: string | null = null;
let inflight: Promise<string> | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEY);
      if (existing) {
        cached = existing;
        return existing;
      }
    } catch {
      // Storage unavailable — fall through to a fresh, unpersisted id below.
    }

    const fresh = Crypto.randomUUID();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, fresh);
    } catch {
      // Best effort — a new id will be generated next call if this didn't stick.
    }
    cached = fresh;
    return fresh;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
