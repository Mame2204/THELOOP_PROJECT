-- Origine des lignes partner_validation_codes sans user_id :
-- 1) Seed migration 20260727 : 1 code par établissement actif (establishment_id, user_id NULL)
-- 2) ensure_partner_validation_code() appelé sans p_user_id (ex. établissement « Loop Tools GN »)
-- Le compte outil@theloop.gn (company = Loop Tools GN) est un compte de test outils, pas un partenaire Spot.

-- Rattacher le code Loop Tools GN au user outil s'il existe
UPDATE public.partner_validation_codes pvc
SET
  user_id = u.id,
  updated_at = NOW()
FROM public.users u
WHERE lower(u.email) = 'outil@theloop.gn'
  AND pvc.user_id IS NULL
  AND (
    pvc.partner_name ILIKE 'Loop Tools%'
    OR pvc.partner_name ILIKE 'THE LOOP%'
  );

-- Walks : utiliser des slugs (plus stables) plutôt que loc-* / evt-*
UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"hotel-noom","title":"Hôtel Noom","description":"Départ à Kaloum, face à la baie."},
    {"order":2,"target_type":"spot","target_id":"lavenue","title":"L''Avenue","description":"Pause business au cœur du quartier."},
    {"order":3,"target_type":"event","target_id":"forum-leaders-finance-guinee-2025","title":"Forum Leaders & Finance","description":"Escalier networking — Hôtel Noom."},
    {"order":4,"target_type":"spot","target_id":"sky-lounge-kaloum","title":"Sky Lounge Kaloum","description":"Fin de parcours en rooftop."}
  ]'::jsonb,
  steps_count = 4,
  updated_at = NOW()
WHERE slug = 'kaloum-golden-hour';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"lavenue","title":"L''Avenue","description":"Café business, Kaloum centre."},
    {"order":2,"target_type":"spot","target_id":"le-petit-bateau","title":"Le Petit Bateau","description":"Terrasse face à la mer."},
    {"order":3,"target_type":"event","target_id":"brunch-affaires-lavenue","title":"Brunch d''Affaires","description":"Rendez-vous networking du dimanche."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'dixinn-street-food';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"palm-camayenne","title":"Palm Camayenne","description":"Départ sous les palmiers de Camayenne."},
    {"order":2,"target_type":"spot","target_id":"le-petit-bateau","title":"Le Petit Bateau","description":"Halte bord de mer."},
    {"order":3,"target_type":"event","target_id":"nuit-etoilee-fally-ipupa","title":"Nuit Étoilée","description":"Coucher de soleil en musique."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'camayenne-sunset';

UPDATE public.loop_walks
SET
  steps = '[
    {"order":1,"target_type":"spot","target_id":"sky-lounge-kaloum","title":"Sky Lounge Kaloum","description":"Rooftop aperitif, vue Kaloum."},
    {"order":2,"target_type":"spot","target_id":"the-roof","title":"The Roof","description":"Deuxième étape nightlife."},
    {"order":3,"target_type":"event","target_id":"nuit-etoilee-fally-ipupa","title":"Nuit Étoilée","description":"Clôture sous les étoiles."}
  ]'::jsonb,
  steps_count = 3,
  updated_at = NOW()
WHERE slug = 'nightlife-kaloum-pulse';
