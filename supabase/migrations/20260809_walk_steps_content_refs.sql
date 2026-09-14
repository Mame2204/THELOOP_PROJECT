-- THE LOOP — Walks : étapes = contenus publiés (event / spot)

-- Remplace le seed free-text par des références catalogue
UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-2","title":"Hôtel Noom"},
    {"order":2,"target_type":"spot","target_id":"loc-1","title":"L''Avenue"},
    {"order":3,"target_type":"event","target_id":"evt-1","title":"Forum Leaders & Finance"},
    {"order":4,"target_type":"spot","target_id":"loc-3","title":"Sky Lounge Kaloum"}
  ]'::jsonb,
  steps_count = 4,
  updated_at = NOW()
WHERE slug = 'kaloum-golden-hour';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-1","title":"L''Avenue"},
    {"order":2,"target_type":"spot","target_id":"loc-4","title":"Le Petit Bateau"},
    {"order":3,"target_type":"event","target_id":"evt-4","title":"Brunch d''Affaires"}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'dixinn-street-food';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-5","title":"Palm Camayenne"},
    {"order":2,"target_type":"spot","target_id":"loc-4","title":"Le Petit Bateau"},
    {"order":3,"target_type":"event","target_id":"evt-5","title":"Nuit Étoilée"}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'camayenne-sunset';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"loc-3","title":"Sky Lounge Kaloum"},
    {"order":2,"target_type":"spot","target_id":"loc-6","title":"The Roof"},
    {"order":3,"target_type":"event","target_id":"evt-5","title":"Nuit Étoilée"}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'nightlife-kaloum-pulse';

-- CTA corner créateur
UPDATE public.creator_corner_features
SET cta_label = 'Découvrir', updated_at = NOW()
WHERE cta_label ILIKE '%interview%' OR cta_label ILIKE '%conseil%';
