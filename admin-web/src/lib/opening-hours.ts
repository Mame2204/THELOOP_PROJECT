export type HoursMode = 'always_open' | 'by_appointment' | 'weekly';

export interface WeeklyHoursSlot {
  id: string;
  days: number[];
  openTime: string;
  closeTime: string;
}

export const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

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
