import AsyncStorage from '@react-native-async-storage/async-storage';
import { notifyAdminUsers } from '@/lib/user-notifications-store';

export interface ToolClaimRequest {
  id: string;
  toolId: string;
  toolName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  message: string;
  countryCode: string;
  createdAt: string;
  status: 'pending' | 'contacted';
}

const KEY = 'loop_tool_claim_requests_v1';

export async function submitToolClaimRequest(input: Omit<ToolClaimRequest, 'id' | 'createdAt' | 'status'>): Promise<void> {
  const all = await loadAll();
  all.unshift({
    ...input,
    id: `claim-${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  await AsyncStorage.setItem(KEY, JSON.stringify(all));

  await notifyAdminUsers({
    title: 'Demande revendication outil',
    message: `${input.contactName || 'Contact'} — « ${input.toolName} » · ${input.contactPhone || input.contactEmail || 'sans coordonnées'}`,
  });
}

async function loadAll(): Promise<ToolClaimRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ToolClaimRequest[];
  } catch {
    return [];
  }
}
