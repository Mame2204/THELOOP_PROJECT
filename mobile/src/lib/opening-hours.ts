export type HoursMode = 'always_open' | 'by_appointment' | 'weekly';

export interface DaySchedule {
  dayOfWeek: number;
  isClosed: boolean;
  openTime: string;
  closeTime: string;
}

export interface WeeklyHoursSlot {
  id: string;
  days: number[];
  openTime: string;
  closeTime: string;
}

export const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

const DAY_INDEX: Record<string, number> = {
  Lun: 1,
  Mar: 2,
  Mer: 3,
  Jeu: 4,
  Ven: 5,
  Sam: 6,
  Dim: 7,
};

export function defaultWeeklySchedules(): DaySchedule[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i + 1,
    isClosed: i === 0,
    openTime: '12:00',
    closeTime: '23:00',
  }));
}

export function formatDaysCompact(dayNumbers: number[]): string {
  const days = [...new Set(dayNumbers)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (!days.length) return '';
  if (days.length === 1) return DAY_LABELS_SHORT[days[0] - 1];

  const segments: string[] = [];
  let start = days[0];
  let prev = days[0];

  for (let i = 1; i <= days.length; i++) {
    const current = days[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    segments.push(
      start === prev
        ? DAY_LABELS_SHORT[start - 1]
        : `${DAY_LABELS_SHORT[start - 1]}–${DAY_LABELS_SHORT[prev - 1]}`,
    );
    if (current != null) {
      start = current;
      prev = current;
    }
  }

  return segments.join(', ');
}

export function formatWeeklySchedules(slots: WeeklyHoursSlot[]): string {
  if (!slots.length) return 'Horaires sur demande';
  return slots
    .map((slot) => {
      const days = formatDaysCompact(slot.days);
      return `${days} · ${slot.openTime}–${slot.closeTime}`;
    })
    .join(' · ');
}

/** Affichage fiche spot : une plage horaire par ligne si le texte est long. */
export function formatOpeningHoursForDisplay(label: string | null | undefined): string {
  const raw = label?.trim() ?? '';
  if (!raw) return 'Non renseignés';

  const parts = raw.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 2) return raw;

  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const days = parts[i];
    const time = parts[i + 1];
    if (time && /^\d{1,2}:\d{2}/.test(time)) {
      lines.push(`${days} · ${time}`);
      continue;
    }
    return raw;
  }

  return lines.length > 1 ? lines.join('\n') : raw;
}

export function openingHoursDisplayFontSize(label: string): number {
  const lineCount = label.split('\n').length;
  const length = label.replace(/\s+/g, ' ').trim().length;

  if (lineCount >= 2) {
    if (length > 46) return 10;
    return 11;
  }
  if (length > 34) return 11;
  if (length > 22) return 12;
  return 13;
}

export function formatHoursMode(mode: HoursMode, slots: WeeklyHoursSlot[]): string {
  if (mode === 'always_open') return '24h / 24 · 7j / 7';
  if (mode === 'by_appointment') return 'Sur rendez-vous';
  return formatWeeklySchedules(slots);
}

export function formatHoursModeFromSettings(
  mode: HoursMode,
  slots: WeeklyHoursSlot[],
  modeLabels: Partial<Record<HoursMode, string>>,
): string {
  if (mode === 'always_open') return modeLabels.always_open?.trim() || '24h / 24 · 7j / 7';
  if (mode === 'by_appointment') return modeLabels.by_appointment?.trim() || 'Sur rendez-vous';
  return formatWeeklySchedules(slots);
}

export interface OpeningHoursModeLabels {
  always_open?: string;
  by_appointment?: string;
}

export function parseOpeningHoursText(
  text: string | null | undefined,
  modeLabels?: OpeningHoursModeLabels,
): { mode: HoursMode; slots: WeeklyHoursSlot[] } {
  const raw = text?.trim() ?? '';
  if (!raw || raw === '—') return { mode: 'weekly', slots: applyPreset('tue_sun') };
  if (/horaires sur demande/i.test(raw)) return { mode: 'weekly', slots: [] };
  if (modeLabels?.always_open && raw === modeLabels.always_open.trim()) {
    return { mode: 'always_open', slots: [] };
  }
  if (modeLabels?.by_appointment && raw === modeLabels.by_appointment.trim()) {
    return { mode: 'by_appointment', slots: [] };
  }
  if (/24h|7j|toujours/i.test(raw)) return { mode: 'always_open', slots: [] };
  if (/rendez-vous|invitation|sur rdv/i.test(raw)) return { mode: 'by_appointment', slots: [] };

  const weekly = parseWeeklySlotsFromText(raw);
  if (weekly?.length) return { mode: 'weekly', slots: weekly };

  return { mode: 'weekly', slots: applyPreset('tue_sun') };
}

export function applyPreset(
  preset: 'tue_sun' | 'sat_only' | 'tue_sat_sun_split',
  tueSunOpen = '12:00',
  tueSunClose = '23:00',
  sunOpen = '12:00',
  sunClose = '20:00',
): WeeklyHoursSlot[] {
  if (preset === 'sat_only') {
    return [{ id: 'sat', days: [6], openTime: tueSunOpen, closeTime: tueSunClose }];
  }
  if (preset === 'tue_sat_sun_split') {
    return [
      { id: 'week', days: [2, 3, 4, 5, 6], openTime: tueSunOpen, closeTime: tueSunClose },
      { id: 'sun', days: [7], openTime: sunOpen, closeTime: sunClose },
    ];
  }
  return [{ id: 'tue_sun', days: [2, 3, 4, 5, 6, 7], openTime: tueSunOpen, closeTime: tueSunClose }];
}

function normalizeTime(value: string): string {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function dayNumbersFromLabels(labels: string[]): number[] {
  return labels
    .map((label) => DAY_INDEX[label.trim()])
    .filter((day): day is number => day != null);
}

function dayNumbersFromDayPart(part: string): number[] {
  const trimmed = part.trim();
  if (!trimmed) return [];
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .flatMap((chunk) => dayNumbersFromDayPart(chunk.trim()))
      .filter((day, index, all) => all.indexOf(day) === index)
      .sort((a, b) => a - b);
  }
  const rangeMatch = /^([A-Za-zÀ-ÿ]{3})\s*[–-]\s*([A-Za-zÀ-ÿ]{3})$/.exec(trimmed);
  if (rangeMatch) return expandDayRange(rangeMatch[1], rangeMatch[2]);
  return dayNumbersFromLabels([trimmed]);
}

function expandDayRange(startLabel: string, endLabel: string): number[] {
  const start = DAY_INDEX[startLabel.trim()];
  const end = DAY_INDEX[endLabel.trim()];
  if (start == null || end == null) return [];
  if (start <= end) {
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [...Array.from({ length: 7 - start + 1 }, (_, i) => start + i), ...Array.from({ length: end }, (_, i) => i + 1)];
}

/** Parse « Mar–Dim · 12:00–23:00 » (plage) ou « Mar, Dim · 12:00–23:00 » (jours séparés). */
function parseLegacyRangeFormat(raw: string): WeeklyHoursSlot[] | null {
  const rangeMatch = /^([A-Za-zÀ-ÿ]{3}(?:\s*,\s*[A-Za-zÀ-ÿ]{3})*|[A-Za-zÀ-ÿ]{3}\s*[–-]\s*[A-Za-zÀ-ÿ]{3}) · (\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/.exec(raw);
  if (!rangeMatch) return null;
  const days = dayNumbersFromDayPart(rangeMatch[1]);
  if (!days.length) return null;
  return [{
    id: 'legacy-range',
    days,
    openTime: normalizeTime(rangeMatch[2]),
    closeTime: normalizeTime(rangeMatch[3]),
  }];
}

/** Parse le format éditeur : « Mar, Mer · 12:00–23:00 · Dim · 12:00–20:00 ». */
function parseWeeklySlotsFromText(raw: string): WeeklyHoursSlot[] | null {
  const legacy = parseLegacyRangeFormat(raw);
  if (legacy) return legacy;

  const parts = raw.split(' · ').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const slots: WeeklyHoursSlot[] = [];
  let pendingDayParts: string[] = [];

  for (const part of parts) {
    const timeMatch = /^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/.exec(part);
    if (timeMatch) {
      const dayLabels = pendingDayParts
        .flatMap((chunk) => chunk.split(','))
        .map((label) => label.trim())
        .filter(Boolean);
      const days = [...new Set(dayLabels.flatMap((part) => dayNumbersFromDayPart(part)))].sort((a, b) => a - b);
      if (days.length) {
        slots.push({
          id: `slot-${slots.length}`,
          days,
          openTime: normalizeTime(timeMatch[1]),
          closeTime: normalizeTime(timeMatch[2]),
        });
      }
      pendingDayParts = [];
      continue;
    }
    pendingDayParts.push(part);
  }

  return slots.length ? slots : null;
}
