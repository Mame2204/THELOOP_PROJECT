import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AutomationJobType } from '@/lib/admin-automation-jobs-store';

const KEY = 'loop_custom_automation_job_types_v1';

export interface CustomAutomationJobTypeDef {
  id: string;
  label: string;
  description: string | null;
  baseJobType: AutomationJobType;
  createdAt: string;
}

export async function listCustomAutomationJobTypes(): Promise<CustomAutomationJobTypeDef[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomAutomationJobTypeDef[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => a.label.localeCompare(b.label, 'fr')) : [];
  } catch {
    return [];
  }
}

export async function addCustomAutomationJobType(input: {
  label: string;
  description?: string;
  baseJobType: AutomationJobType;
}): Promise<CustomAutomationJobTypeDef> {
  const label = input.label.trim();
  if (!label) throw new Error('Libellé requis');
  const items = await listCustomAutomationJobTypes();
  const entry: CustomAutomationJobTypeDef = {
    id: `custom-job-type-${Date.now()}`,
    label,
    description: input.description?.trim() || null,
    baseJobType: input.baseJobType,
    createdAt: new Date().toISOString(),
  };
  items.unshift(entry);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
  return entry;
}

export async function deleteCustomAutomationJobType(id: string): Promise<boolean> {
  const items = await listCustomAutomationJobTypes();
  const next = items.filter((t) => t.id !== id);
  if (next.length === items.length) return false;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return true;
}
