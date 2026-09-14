-- Production V1.0 : establishments.price_indicator est VARCHAR(5) (€, €€, €€€).
-- L'app mobile envoie des libellés libres (ex. "50k – 150k GNF") via price_label
-- → erreur "value too long for type character varying(5)" à la publication spot.

ALTER TABLE public.establishments
  ALTER COLUMN price_indicator TYPE TEXT;

COMMENT ON COLUMN public.establishments.price_indicator IS
  'Indicateur tarifaire court (€€) ou libellé libre saisi par le partenaire (ex. fourchette GNF).';
