import {
  DAY_LABELS_SHORT,
  formatDaysCompact,
  formatWeeklySchedules,
  type WeeklyHoursSlot,
} from '../lib/opening-hours';
import type { OpeningHoursPresetConfig, OpeningHoursSettings } from '../lib/opening-hours-settings-store';

interface Props {
  preset: OpeningHoursPresetConfig;
  settings: OpeningHoursSettings;
  canDelete: boolean;
  onChange: (patch: Partial<OpeningHoursPresetConfig>) => void;
  onDelete: () => void;
}

function ensureSlots(preset: OpeningHoursPresetConfig, settings: OpeningHoursSettings): WeeklyHoursSlot[] {
  if (preset.slots.length) return preset.slots;
  return [
    {
      id: 'main',
      days: [2, 3, 4, 5, 6],
      openTime: settings.defaultOpenTime,
      closeTime: settings.defaultCloseTime,
    },
  ];
}

function updateSlot(slots: WeeklyHoursSlot[], slotId: string, patch: Partial<WeeklyHoursSlot>): WeeklyHoursSlot[] {
  return slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s));
}

function toggleDayInSlot(slots: WeeklyHoursSlot[], slotId: string, day: number): WeeklyHoursSlot[] {
  const target = slots.find((s) => s.id === slotId);
  if (!target) return slots;

  const removing = target.days.includes(day);
  const nextDays = removing
    ? target.days.filter((d) => d !== day)
    : [...target.days, day].sort((a, b) => a - b);

  return slots.map((slot) => {
    if (slot.id === slotId) {
      return { ...slot, days: nextDays.length ? nextDays : [day] };
    }
    if (!removing) {
      return { ...slot, days: slot.days.filter((d) => d !== day) };
    }
    return slot;
  });
}

function addSlot(slots: WeeklyHoursSlot[], settings: OpeningHoursSettings): WeeklyHoursSlot[] {
  const used = new Set(slots.flatMap((s) => s.days));
  const freeDay = [1, 2, 3, 4, 5, 6, 7].find((d) => !used.has(d)) ?? 7;
  const isSunday = freeDay === 7;
  return [
    ...slots,
    {
      id: `slot-${Date.now()}`,
      days: [freeDay],
      openTime: isSunday ? settings.defaultSunOpenTime : settings.defaultOpenTime,
      closeTime: isSunday ? settings.defaultSunCloseTime : settings.defaultCloseTime,
    },
  ];
}

export function OpeningHoursPresetBuilder({ preset, settings, canDelete, onChange, onDelete }: Props) {
  const slots = ensureSlots(preset, settings);

  function setSlots(next: WeeklyHoursSlot[]) {
    onChange({ slots: next });
  }

  return (
    <div className="card hours-preset-card">
      <div className="row-between">
        <strong>{preset.label || 'Raccourci'}</strong>
        <div className="hours-preset-actions">
          <button
            type="button"
            className={`target-chip${preset.enabled ? ' active' : ''}`}
            onClick={() => onChange({ enabled: !preset.enabled })}
          >
            {preset.enabled ? 'Actif' : 'Inactif'}
          </button>
          {canDelete ? (
            <button type="button" className="btn ghost small danger" onClick={onDelete}>
              Supprimer
            </button>
          ) : null}
        </div>
      </div>

      <div className="field">
        <label>Libellé du bouton (formulaire spot)</label>
        <input
          value={preset.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Ex. Lun–Ven + Dim"
        />
      </div>

      <p className="meta">
        Créez une plage par groupe de jours. Ex. Lun–Ven à 12h–23h et Dim à 12h–20h si les horaires diffèrent.
      </p>

      {slots.map((slot, index) => (
        <div key={slot.id} className="hours-slot-card">
          <div className="row-between">
            <strong>
              Plage {index + 1}
              {slot.days.length ? ` · ${formatDaysCompact(slot.days)}` : ''}
            </strong>
            {slots.length > 1 ? (
              <button
                type="button"
                className="btn ghost small danger"
                onClick={() => setSlots(slots.filter((s) => s.id !== slot.id))}
              >
                Retirer
              </button>
            ) : null}
          </div>

          <div className="field">
            <label>Jours</label>
            <div className="chip-row">
              {DAY_LABELS_SHORT.map((label, dayIndex) => {
                const day = dayIndex + 1;
                const selected = slot.days.includes(day);
                const usedElsewhere = slots.some((s) => s.id !== slot.id && s.days.includes(day));
                return (
                  <button
                    key={`${slot.id}-${label}`}
                    type="button"
                    className={`target-chip${selected ? ' active' : ''}`}
                    style={{ opacity: usedElsewhere && !selected ? 0.45 : 1 }}
                    onClick={() => setSlots(toggleDayInSlot(slots, slot.id, day))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hours-time-row">
            <div className="field">
              <label>Ouverture</label>
              <input
                value={slot.openTime}
                onChange={(e) => setSlots(updateSlot(slots, slot.id, { openTime: e.target.value }))}
                placeholder={settings.defaultOpenTime}
              />
            </div>
            <div className="field">
              <label>Fermeture</label>
              <input
                value={slot.closeTime}
                onChange={(e) => setSlots(updateSlot(slots, slot.id, { closeTime: e.target.value }))}
                placeholder={settings.defaultCloseTime}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn ghost small hours-add-slot"
        onClick={() => setSlots(addSlot(slots, settings))}
      >
        + Ajouter une plage horaire
      </button>

      <p className="meta hours-preview">Aperçu affiché : {formatWeeklySchedules(slots)}</p>
    </div>
  );
}
