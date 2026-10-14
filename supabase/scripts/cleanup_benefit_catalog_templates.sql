-- Nettoyage idempotent modèles vs déploiements (à lancer après migration 20260966).
-- Prérequis : colonnes is_template, template_local_id + fonctions benefit_catalog_*.

-- Aperçu avant nettoyage
SELECT
  bc.title,
  bc.local_id,
  bc.partner_name,
  bc.is_active,
  bc.is_template,
  bc.template_local_id,
  public.benefit_catalog_has_content_ref(bc.offering_partners) AS has_lieu
FROM public.benefit_catalog bc
ORDER BY lower(bc.title), bc.is_template DESC, bc.is_active DESC;

-- Re-classifier (au cas où offering_partners a changé)
UPDATE public.benefit_catalog bc
SET is_template = public.benefit_catalog_is_template_row(bc.offering_partners)
WHERE bc.is_template IS DISTINCT FROM public.benefit_catalog_is_template_row(bc.offering_partners);

UPDATE public.benefit_catalog bc
SET is_template = FALSE
WHERE public.benefit_catalog_has_content_ref(bc.offering_partners);

-- Relier déploiements → modèle
UPDATE public.benefit_catalog dep
SET template_local_id = tmpl.local_id,
    updated_at = NOW()
FROM public.benefit_catalog tmpl
WHERE dep.template_local_id IS NULL
  AND public.benefit_catalog_has_content_ref(dep.offering_partners)
  AND public.benefit_catalog_is_template_row(tmpl.offering_partners)
  AND lower(trim(tmpl.title)) = lower(trim(dep.title))
  AND COALESCE(tmpl.country_code, '') = COALESCE(dep.country_code, '')
  AND tmpl.local_id <> dep.local_id;

-- Désactiver modèles actifs en double d''un déploiement actif
UPDATE public.benefit_catalog bc
SET
  is_active = FALSE,
  is_template = TRUE,
  updated_at = NOW()
WHERE bc.is_template = TRUE
  AND bc.is_active = TRUE
  AND EXISTS (
    SELECT 1
    FROM public.benefit_catalog dep
    WHERE dep.local_id <> bc.local_id
      AND dep.is_active = TRUE
      AND dep.is_template = FALSE
      AND public.benefit_catalog_has_content_ref(dep.offering_partners)
      AND lower(trim(dep.title)) = lower(trim(bc.title))
      AND COALESCE(dep.country_code, '') = COALESCE(bc.country_code, '')
  );

-- Contrôle après nettoyage
SELECT
  title,
  count(*) FILTER (WHERE is_active) AS actifs,
  count(*) FILTER (WHERE is_template AND is_active) AS modeles_actifs,
  count(*) FILTER (WHERE NOT is_template AND is_active) AS deploiements_actifs
FROM public.benefit_catalog
GROUP BY title
HAVING count(*) > 1
ORDER BY title;
