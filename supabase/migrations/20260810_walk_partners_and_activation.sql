-- THE LOOP — Walks : partenaires associés + activation claire

ALTER TABLE public.loop_walks
  ADD COLUMN IF NOT EXISTS partner_ids TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.loop_walks.is_published IS
  'false = parcours désactivé (invisible dans l''app). true = affiché.';

COMMENT ON COLUMN public.loop_walks.partner_ids IS
  'IDs partenaires associés au parcours (affichés en bas de fiche si renseignés).';

-- Enrichir les étapes avec phrases de localisation
UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-2","title":"Hôtel Noom","description":"Départ à Kaloum, face à la baie."},
    {"order":2,"target_type":"spot","target_id":"loc-1","title":"L''Avenue","description":"Pause business au cœur du quartier."},
    {"order":3,"target_type":"event","target_id":"evt-1","title":"Forum Leaders & Finance","description":"Escalier networking — Hôtel Noom."},
    {"order":4,"target_type":"spot","target_id":"loc-3","title":"Sky Lounge Kaloum","description":"Fin de parcours en rooftop."}
  ]'::jsonb,
  steps_count = 4,
  updated_at = NOW()
WHERE slug = 'kaloum-golden-hour';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-1","title":"L''Avenue","description":"Café business, Kaloum centre."},
    {"order":2,"target_type":"spot","target_id":"loc-4","title":"Le Petit Bateau","description":"Terrasse face à la mer."},
    {"order":3,"target_type":"event","target_id":"evt-4","title":"Brunch d''Affaires","description":"Rendez-vous networking du dimanche."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'dixinn-street-food';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-5","title":"Palm Camayenne","description":"Départ sous les palmiers de Camayenne."},
    {"order":2,"target_type":"spot","target_id":"loc-4","title":"Le Petit Bateau","description":"Halte bord de mer."},
    {"order":3,"target_type":"event","target_id":"evt-5","title":"Nuit Étoilée","description":"Coucher de soleil en musique."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'camayenne-sunset';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-3","title":"Sky Lounge Kaloum","description":"Rooftop aperitif, vue Kaloum."},
    {"order":2,"target_type":"spot","target_id":"loc-6","title":"The Roof","description":"Deuxième étape nightlife."},
    {"order":3,"target_type":"event","target_id":"evt-5","title":"Nuit Étoilée","description":"Clôture sous les étoiles."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'nightlife-kaloum-pulse';
