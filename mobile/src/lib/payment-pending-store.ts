import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loop_pending_payment_intent_v1';

export interface PendingPaymentIntent {
  intentId: string;
  userId: string;
  savedAt: string;
}

export async function savePendingPaymentIntent(
  intentId: string,
  userId: string,
): Promise<void> {
  const payload: PendingPaymentIntent = {
    intentId: intentId.trim(),
    userId: userId.trim(),
    savedAt: new Date().toISOString(),
  };
  if (!payload.intentId || !payload.userId) return;
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}

const MAX_AGE_MS = 72 * 60 * 60 * 1000;

export async function loadPendingPaymentIntent(): Promise<PendingPaymentIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPaymentIntent;
    if (!parsed?.intentId || !parsed?.userId) return null;
    const at = Date.parse(parsed.savedAt);
    if (!Number.isNaN(at) && Date.now() - at > MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingPaymentIntent(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
