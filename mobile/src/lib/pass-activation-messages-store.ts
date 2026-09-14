import {
  fetchAppSetting,
  loadCachedJson,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { HERITAGE_CATALOG_ID } from '@/lib/pass-catalog-store';
import {
  HERITAGE_PASS_LABEL,
  isHeritagePass,
  passDisplayLabel,
  type SubscriptionRecord,
} from '@/lib/subscription-history';
import { appendUserNotification } from '@/lib/user-notifications-store';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';

export type PassActivationType =
  | 'heritage'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'lifetime'
  | 'referral'
  | 'default';

export type PassActivationMessageStatus = 'active' | 'inactive' | 'archived';

export interface PassActivationMessage {
  id: string;
  passType: PassActivationType;
  /** Lien optionnel vers une entrée du catalogue PASS. */
  passCatalogId?: string | null;
  name: string;
  titleTemplate: string;
  messageTemplate: string;
  status: PassActivationMessageStatus;
  createdAt: string;
  updatedAt: string;
}

const CACHE_BASE = 'loop_pass_activation_messages_v1';
const REMOTE_BASE = 'pass_activation_messages_v1';
const LEGACY_CACHE = 'loop_pass_activation_messages_v1';
const LEGACY_REMOTE = 'pass_activation_messages_v1';

export const PASS_ACTIVATION_TYPE_LABELS: Record<PassActivationType, string> = {
  heritage: 'PASS Heritage',
  monthly: 'PASS Mensuel',
  quarterly: 'PASS Trimestriel',
  annual: 'PASS Annuel',
  lifetime: 'PASS À vie',
  referral: 'PASS Parrainage',
  default: 'PASS Prime (générique)',
};

export const PASS_ACTIVATION_VARIABLES =
  '{firstName}, {passLabel}, {passType}, {validity}';

function nowIso(): string {
  return new Date().toISOString();
}

function formatValidityLine(record?: SubscriptionRecord | null): string {
  if (!record) return '';
  if (isHeritagePass(record) || !record.expiresAt) {
    return 'Sans expiration';
  }
  try {
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(record.expiresAt));
    return `Valable jusqu'au ${formatted}`;
  } catch {
    return `Valable jusqu'au ${record.expiresAt}`;
  }
}

function defaultMessages(): PassActivationMessage[] {
  const createdAt = nowIso();
  return [
    {
      id: 'pass-msg-heritage',
      passType: 'heritage',
      name: 'Activation PASS Heritage',
      titleTemplate: 'Bonjour {firstName} !',
      messageTemplate:
        'Félicitations — ton {passLabel} vient d\'être activé. {validity}. ' +
        'Tu fais désormais partie de Loop Prime : avantages exclusifs, offres partenaires et expériences premium t\'attendent.',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'pass-msg-monthly',
      passType: 'monthly',
      name: 'Activation PASS Mensuel',
      titleTemplate: 'Bienvenue dans Loop Prime, {firstName} !',
      messageTemplate:
        'Ton {passLabel} est actif. {validity}. Profite dès maintenant de tous les avantages Prime.',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'pass-msg-default',
      passType: 'default',
      name: 'Activation PASS (générique)',
      titleTemplate: 'Bonjour {firstName} !',
      messageTemplate:
        'Excellente nouvelle : ton {passLabel} vient d\'être activé. {validity}. Bienvenue dans l\'expérience Loop Prime !',
      status: 'active',
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function messageKeys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cc,
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

async function loadAll(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): Promise<PassActivationMessage[]> {
  const { cache, remote, isLegacyGn } = messageKeys(countryCode);
  let remoteData = await fetchAppSetting<PassActivationMessage[]>(remote);
  if (!remoteData?.length && isLegacyGn) {
    remoteData = await fetchAppSetting<PassActivationMessage[]>(LEGACY_REMOTE);
    if (remoteData?.length) {
      await upsertAppSetting(remote, remoteData);
    }
  }
  if (remoteData !== null && remoteData.length) {
    await saveCachedJson(cache, remoteData);
    return remoteData;
  }
  const cached = await loadCachedJson<PassActivationMessage[]>(cache);
  if (cached?.length) return cached;
  if (isLegacyGn) {
    const legacyCached = await loadCachedJson<PassActivationMessage[]>(LEGACY_CACHE);
    if (legacyCached?.length) {
      await saveCachedJson(cache, legacyCached);
      await upsertAppSetting(remote, legacyCached);
      return legacyCached;
    }
  }
  const defaults = defaultMessages();
  await saveCachedJson(cache, defaults);
  return defaults;
}

async function saveAll(countryCode: CountryCode, messages: PassActivationMessage[]): Promise<void> {
  const { cache, remote } = messageKeys(countryCode);
  await saveCachedJson(cache, messages);
  await upsertAppSetting(remote, messages);
}

export async function listPassActivationMessages(options?: {
  countryCode?: CountryCode;
  includeArchived?: boolean;
  status?: PassActivationMessageStatus | PassActivationMessageStatus[];
}): Promise<PassActivationMessage[]> {
  const cc = resolveCountryCode(options?.countryCode);
  let messages = await loadAll(cc);
  if (!options?.includeArchived) {
    messages = messages.filter((m) => m.status !== 'archived');
  }
  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    messages = messages.filter((m) => statuses.includes(m.status));
  }
  return messages.sort((a, b) => a.passType.localeCompare(b.passType));
}

export async function getPassActivationMessage(
  id: string,
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<PassActivationMessage | null> {
  const messages = await loadAll(resolveCountryCode(countryCode));
  return messages.find((m) => m.id === id) ?? null;
}

export function resolvePassActivationType(
  record?: Pick<SubscriptionRecord, 'passKind' | 'label' | 'billingPeriod' | 'passCatalogId'> | null,
  period?: PrimeBillingPeriod,
): PassActivationType {
  if (record?.passCatalogId) {
    if (record.passCatalogId === HERITAGE_CATALOG_ID) return 'heritage';
  }
  if (record && isHeritagePass(record as SubscriptionRecord)) return 'heritage';
  const label = (record?.label ?? '').toLowerCase();
  if (label.includes('parrainage')) return 'referral';
  const billing = period ?? record?.billingPeriod;
  if (billing === 'monthly' || billing === 'quarterly' || billing === 'annual' || billing === 'lifetime') {
    return billing;
  }
  return 'default';
}

export function renderPassActivationTemplate(
  template: string,
  vars: { firstName: string; passLabel: string; passType: string; validity: string },
): string {
  return template
    .replace(/\{firstName\}/g, vars.firstName)
    .replace(/\{passLabel\}/g, vars.passLabel)
    .replace(/\{passType\}/g, vars.passType)
    .replace(/\{validity\}/g, vars.validity);
}

export async function createPassActivationMessage(
  countryCode: CountryCode,
  input: {
    passType: PassActivationType;
    name: string;
    titleTemplate: string;
    messageTemplate: string;
    status?: PassActivationMessageStatus;
  },
): Promise<PassActivationMessage> {
  const cc = resolveCountryCode(countryCode);
  const messages = await loadAll(cc);
  const now = nowIso();
  const entry: PassActivationMessage = {
    id: `pass-msg-${Date.now()}`,
    passType: input.passType,
    name: input.name.trim(),
    titleTemplate: input.titleTemplate.trim(),
    messageTemplate: input.messageTemplate.trim(),
    status: input.status ?? 'inactive',
    createdAt: now,
    updatedAt: now,
  };
  messages.unshift(entry);
  await saveAll(cc, messages);
  return entry;
}

export async function updatePassActivationMessage(
  countryCode: CountryCode,
  id: string,
  patch: Partial<
    Pick<PassActivationMessage, 'name' | 'titleTemplate' | 'messageTemplate' | 'status' | 'passType'>
  >,
): Promise<PassActivationMessage | null> {
  const cc = resolveCountryCode(countryCode);
  const messages = await loadAll(cc);
  const idx = messages.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  messages[idx] = {
    ...messages[idx],
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : messages[idx].name,
    titleTemplate:
      patch.titleTemplate !== undefined ? patch.titleTemplate.trim() : messages[idx].titleTemplate,
    messageTemplate:
      patch.messageTemplate !== undefined
        ? patch.messageTemplate.trim()
        : messages[idx].messageTemplate,
    updatedAt: nowIso(),
  };
  await saveAll(cc, messages);
  return messages[idx];
}

export async function setPassActivationMessageStatus(
  countryCode: CountryCode,
  id: string,
  status: PassActivationMessageStatus,
): Promise<boolean> {
  const updated = await updatePassActivationMessage(countryCode, id, { status });
  return updated != null;
}

export async function archivePassActivationMessage(
  countryCode: CountryCode,
  id: string,
): Promise<boolean> {
  return setPassActivationMessageStatus(countryCode, id, 'archived');
}

export async function deletePassActivationMessage(
  countryCode: CountryCode,
  id: string,
): Promise<boolean> {
  const cc = resolveCountryCode(countryCode);
  const messages = await loadAll(cc);
  const next = messages.filter((m) => m.id !== id);
  if (next.length === messages.length) return false;
  await saveAll(cc, next);
  return true;
}

/** Envoie la notification automatique si un modèle actif existe pour ce type de PASS. */
export async function sendPassActivationNotification(input: {
  userId: string;
  firstName?: string | null;
  passLabel?: string | null;
  passType: PassActivationType;
  passCatalogId?: string | null;
  record?: SubscriptionRecord | null;
  countryCode?: CountryCode;
}): Promise<boolean> {
  const cc = resolveCountryCode(input.countryCode);
  const messages = await listPassActivationMessages({ countryCode: cc, status: 'active' });
  const passLabel =
    input.passLabel?.trim() ||
    (input.record ? passDisplayLabel(input.record) : PASS_ACTIVATION_TYPE_LABELS[input.passType]);
  const passTypeLabel = PASS_ACTIVATION_TYPE_LABELS[input.passType] ?? passLabel;
  const template =
    (input.passCatalogId
      ? messages.find((m) => m.passCatalogId === input.passCatalogId)
      : undefined) ??
    messages.find((m) => m.passType === input.passType) ??
    messages.find((m) => m.passType === 'default');
  const vars = {
    firstName: input.firstName?.trim() || 'Membre',
    passLabel: passLabel || HERITAGE_PASS_LABEL,
    passType: passTypeLabel,
    validity: formatValidityLine(input.record),
  };

  if (!template) {
    await appendUserNotification(input.userId, {
      title: `PASS activé — ${vars.passLabel}`,
      message: `Bonjour ${vars.firstName}, votre ${vars.passLabel} est maintenant actif. ${vars.validity}`.trim(),
      audience: 'individual',
    });
    return true;
  }

  const title = renderPassActivationTemplate(template.titleTemplate, vars);
  let message = renderPassActivationTemplate(template.messageTemplate, vars);
  if (vars.validity && !message.includes(vars.validity) && !template.messageTemplate.includes('{validity}')) {
    message = `${message.trim()} ${vars.validity}.`.replace(/\s+/g, ' ').trim();
  }
  if (vars.passLabel && !message.includes(vars.passLabel) && !title.includes(vars.passLabel)) {
    message = `${vars.passLabel} — ${message}`;
  }

  await appendUserNotification(input.userId, {
    title,
    message,
    audience: 'individual',
  });
  return true;
}
