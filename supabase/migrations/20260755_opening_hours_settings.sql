-- Paramètres horaires spots (super admin) — clé app_settings opening_hours_config

INSERT INTO public.app_settings (key, value)
VALUES (
  'opening_hours_config',
  '{
    "modes": {
      "always_open": { "label": "Toujours ouvert", "enabled": true },
      "by_appointment": { "label": "Sur RDV", "enabled": true },
      "weekly": { "label": "Plages horaires", "enabled": true }
    },
    "presets": [
      { "id": "tue_sun", "label": "Mar–Dim", "preset": "tue_sun", "enabled": true },
      { "id": "sat_only", "label": "Sam uniquement", "preset": "sat_only", "enabled": true },
      { "id": "tue_sat_sun_split", "label": "Mar–Sam + Dim", "preset": "tue_sat_sun_split", "enabled": true }
    ],
    "defaultOpenTime": "12:00",
    "defaultCloseTime": "23:00",
    "defaultSunOpenTime": "12:00",
    "defaultSunCloseTime": "20:00",
    "updatedAt": "1970-01-01T00:00:00.000Z"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
