import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'loop_deactivated_user_ids_v1';

async function load(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function save(ids: Set<string>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...ids]));
}

export async function isUserDeactivated(userId: string): Promise<boolean> {
  const ids = await load();
  return ids.has(userId);
}

export async function setUserDeactivated(userId: string, deactivated: boolean): Promise<void> {
  const ids = await load();
  if (deactivated) ids.add(userId);
  else ids.delete(userId);
  await save(ids);
}

export async function isPhoneDeactivated(phone: string): Promise<boolean> {
  const ids = await load();
  return ids.has(`phone:${phone}`);
}

export async function setPhoneDeactivated(phone: string, deactivated: boolean): Promise<void> {
  const ids = await load();
  const key = `phone:${phone}`;
  if (deactivated) ids.add(key);
  else ids.delete(key);
  await save(ids);
}
