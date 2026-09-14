import { parseOpeningHoursText } from '@/lib/opening-hours';
import { getOpeningHoursSettings } from '@/lib/opening-hours-settings-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function normalizeDbTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Synchronise opening_hours_label + establishment_schedules depuis le libellé formulaire. */
export async function syncEstablishmentOpeningHours(
  establishmentId: string,
  openingHoursLabel: string | null | undefined,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !establishmentId) return;

  const label = openingHoursLabel?.trim() ?? '';
  await supabase
    .from('establishments')
    .update({ opening_hours_label: label || null })
    .eq('id', establishmentId);

  await supabase.from('establishment_schedules').delete().eq('establishment_id', establishmentId);

  if (!label) return;

  const settings = await getOpeningHoursSettings();
  const { mode, slots } = parseOpeningHoursText(label, {
    always_open: settings.modes.always_open.label,
    by_appointment: settings.modes.by_appointment.label,
  });

  if (mode === 'by_appointment') return;

  if (mode === 'always_open') {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      establishment_id: establishmentId,
      day_of_week: i + 1,
      opening_time: '00:00',
      closing_time: '23:59',
      is_closed: false,
    }));
    await supabase.from('establishment_schedules').insert(rows);
    return;
  }

  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = i + 1;
    const slot = slots.find((s) => s.days.includes(day));
    if (!slot) {
      return {
        establishment_id: establishmentId,
        day_of_week: day,
        opening_time: '00:00',
        closing_time: '00:00',
        is_closed: true,
      };
    }
    return {
      establishment_id: establishmentId,
      day_of_week: day,
      opening_time: normalizeDbTime(slot.openTime),
      closing_time: normalizeDbTime(slot.closeTime),
      is_closed: false,
    };
  });

  const hasOpenDay = rows.some((r) => !r.is_closed);
  if (hasOpenDay) {
    await supabase.from('establishment_schedules').insert(rows);
  }
}
