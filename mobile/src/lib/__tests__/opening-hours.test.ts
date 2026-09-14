import {
  formatDaysCompact,
  formatOpeningHoursForDisplay,
  formatWeeklySchedules,
  parseOpeningHoursText,
} from '@/lib/opening-hours';

describe('formatDaysCompact', () => {
  it('compacte les jours consécutifs en plage', () => {
    expect(formatDaysCompact([2, 3, 4, 5, 6, 7])).toBe('Mar–Dim');
    expect(formatDaysCompact([2, 3, 4, 5, 6])).toBe('Mar–Sam');
  });

  it('utilise la virgule pour les jours non consécutifs', () => {
    expect(formatDaysCompact([2, 7])).toBe('Mar, Dim');
    expect(formatDaysCompact([2, 3, 6])).toBe('Mar–Mer, Sam');
  });

  it('affiche un seul jour sans séparateur', () => {
    expect(formatDaysCompact([6])).toBe('Sam');
  });
});

describe('parseOpeningHoursText', () => {
  it('interprète Mar–Dim comme une plage consécutive', () => {
    const parsed = parseOpeningHoursText('Mar–Dim · 12:00–23:00');
    expect(parsed.slots[0]?.days).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('interprète Mar, Dim comme mardi et dimanche séparés', () => {
    const parsed = parseOpeningHoursText('Mar, Dim · 12:00–23:00');
    expect(parsed.slots[0]?.days).toEqual([2, 7]);
  });

  it('formate une plage puis relit la même chose', () => {
    const label = formatWeeklySchedules([{
      id: 'a',
      days: [2, 3, 4, 5, 6, 7],
      openTime: '12:00',
      closeTime: '23:00',
    }]);
    expect(label).toBe('Mar–Dim · 12:00–23:00');
    expect(parseOpeningHoursText(label).slots[0]?.days).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('formate des jours séparés puis relit la même chose', () => {
    const label = formatWeeklySchedules([{
      id: 'a',
      days: [2, 7],
      openTime: '12:00',
      closeTime: '23:00',
    }]);
    expect(label).toBe('Mar, Dim · 12:00–23:00');
    expect(parseOpeningHoursText(label).slots[0]?.days).toEqual([2, 7]);
  });
});

describe('formatOpeningHoursForDisplay', () => {
  it('met chaque plage horaire sur une ligne', () => {
    const display = formatOpeningHoursForDisplay('Mar–Sam · 12:00–23:00 · Dim · 12:00–20:00');
    expect(display).toBe('Mar–Sam · 12:00–23:00\nDim · 12:00–20:00');
  });

  it('laisse une seule plage sur une ligne', () => {
    expect(formatOpeningHoursForDisplay('Mar–Dim · 12:00–23:00')).toBe('Mar–Dim · 12:00–23:00');
  });

  it('conserve les libellés de mode', () => {
    expect(formatOpeningHoursForDisplay('Sur rendez-vous')).toBe('Sur rendez-vous');
  });
});
