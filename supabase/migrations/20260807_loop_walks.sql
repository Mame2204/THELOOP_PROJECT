-- THE LOOP — Walks / parcours guidés

CREATE TABLE IF NOT EXISTS public.loop_walks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  cover_image_url TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  steps_count INTEGER NOT NULL CHECK (steps_count > 0),
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_featured_week BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT true,
  country_code TEXT NOT NULL DEFAULT 'GN',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT loop_walks_steps_array CHECK (jsonb_typeof(steps) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loop_walks_one_featured
  ON public.loop_walks (country_code)
  WHERE is_featured_week = true AND is_published = true;

CREATE INDEX IF NOT EXISTS idx_loop_walks_published
  ON public.loop_walks (is_published, sort_order, created_at DESC);

ALTER TABLE public.loop_walks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read published loop walks" ON public.loop_walks;
CREATE POLICY "Public read published loop walks"
  ON public.loop_walks FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "Admin manage loop walks" ON public.loop_walks;
CREATE POLICY "Admin manage loop walks"
  ON public.loop_walks FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.loop_walks (
  slug, title, cover_image_url, duration_minutes, steps_count,
  category, category_label, summary, description, steps,
  is_featured_week, is_published, country_code, sort_order
)
SELECT * FROM (VALUES
  (
    'kaloum-golden-hour',
    'Kaloum au golden hour',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
    90,
    5,
    'heritage',
    'Patrimoine',
    'Une balade douce entre places, façades et lumières du centre.',
    'Parcours pensé pour découvrir Kaloum autrement : rythmes urbains, architecture et pauses photo au meilleur moment de la journée.',
    '[
      {"order":1,"title":"Place des Martyrs","description":"Point de départ, lecture du centre-ville."},
      {"order":2,"title":"Façades coloniales","description":"Détails et textures du quartier historique."},
      {"order":3,"title":"Corniche express","description":"Vue mer et respiration."},
      {"order":4,"title":"Café de pause","description":"Stop boisson et notes de terrain."},
      {"order":5,"title":"Golden frame","description":"Dernière vue au coucher du soleil."}
    ]'::jsonb,
    true,
    true,
    'GN',
    1
  ),
  (
    'dixinn-street-food',
    'Street food Dixinn',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&q=80',
    60,
    4,
    'food',
    'Food',
    'Quatre étapes gourmandes, zéro formalisme.',
    'Un parcours court pour goûter Conakry côté rue : grillades, jus locaux et ambiances de quartier.',
    '[
      {"order":1,"title":"Stand de départ","description":"Accueil et première dégustation."},
      {"order":2,"title":"Grillades","description":"Le cœur du parcours."},
      {"order":3,"title":"Jus maison","description":"Pause fraîcheur."},
      {"order":4,"title":"Dessert surprise","description":"Fin sucrée."}
    ]'::jsonb,
    false,
    true,
    'GN',
    2
  ),
  (
    'camayenne-sunset',
    'Camayenne sunset walk',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
    75,
    4,
    'nature',
    'Nature',
    'Bord de mer, horizon et silence relatif.',
    'Une boucle légère le long de Camayenne pour souffler, photographier et finir face à l’Atlantique.',
    '[
      {"order":1,"title":"Départ plage","description":"Chaussures adaptées."},
      {"order":2,"title":"Promenade palmée","description":"Ombre et rythme lent."},
      {"order":3,"title":"Point vue","description":"Pause photo."},
      {"order":4,"title":"Sunset close","description":"Fin de parcours."}
    ]'::jsonb,
    false,
    true,
    'GN',
    3
  ),
  (
    'nightlife-kaloum-pulse',
    'Pulse nocturne Kaloum',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80',
    120,
    5,
    'nightlife',
    'Nightlife',
    'Musique, terrasses et énergie du soir.',
    'Cinq étapes pour sentir le pulse du centre après 20h — sans course, juste le bon tempo.',
    '[
      {"order":1,"title":"Warm-up terrace","description":"Premier verre."},
      {"order":2,"title":"Live corner","description":"Scène courte."},
      {"order":3,"title":"Street vibe","description":"Ambiance rue."},
      {"order":4,"title":"Rooftop hop","description":"Vue et musique."},
      {"order":5,"title":"Late close","description":"Dernière note."}
    ]'::jsonb,
    false,
    true,
    'GN',
    4
  )
) AS v(
  slug, title, cover_image_url, duration_minutes, steps_count,
  category, category_label, summary, description, steps,
  is_featured_week, is_published, country_code, sort_order
)
WHERE NOT EXISTS (SELECT 1 FROM public.loop_walks LIMIT 1);
