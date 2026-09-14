-- THE LOOP — Documentation des tables Supabase (COMMENT ON TABLE)
-- =============================================================================
-- Objectif : afficher une description sous chaque table dans Supabase
--            (Database → Tables), comme walk_ratings ou tool_photos.
--
-- Usage : coller et exécuter dans Supabase → SQL Editor (prod ou sandbox).
-- Idempotent : n'échoue pas si une table n'existe pas encore sur le projet.
-- Ne modifie aucune donnée — métadonnées uniquement.
-- =============================================================================

CREATE OR REPLACE FUNCTION public._loop_set_table_comment(p_relname text, p_comment text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_reg regclass;
BEGIN
  v_reg := to_regclass('public.' || p_relname);
  IF v_reg IS NOT NULL THEN
    EXECUTE format('COMMENT ON TABLE %s IS %L', v_reg, p_comment);
  END IF;
END;
$$;

-- ─── Comptes & rôles ───────────────────────────────────────────────────────
SELECT public._loop_set_table_comment('users',
  'Comptes THE LOOP : identité, e-mail, rôle (visiteur, membre, prime, partenaire, admin), pays, téléphone.');
SELECT public._loop_set_table_comment('profiles',
  'Profils étendus (legacy / complément users) — préférences et métadonnées compte.');
SELECT public._loop_set_table_comment('platform_roles',
  'Matrice des rôles plateforme et permissions de base (référentiel).');
SELECT public._loop_set_table_comment('signup_attempts',
  'Journal des tentatives d''inscription (anti-abus, sécurité e-mail).');
SELECT public._loop_set_table_comment('admin_permission_overrides',
  'Surcharges de permissions admin par utilisateur (Control Tower).');
SELECT public._loop_set_table_comment('admin_user_invites',
  'Invitations comptes admin / équipe — jetons et statut d''activation.');

-- ─── Contenu public : agenda & guide ───────────────────────────────────────
SELECT public._loop_set_table_comment('events',
  'Événements publiés (agenda) — dates, visibilité, clics, favoris, contenu Loop Prime.');
SELECT public._loop_set_table_comment('event_speakers',
  'Intervenants / artistes liés à un événement.');
SELECT public._loop_set_table_comment('event_schedules',
  'Créneaux horaires d''un événement (multi-sessions).');
SELECT public._loop_set_table_comment('establishments',
  'Spots / adresses publiées (guide) — nom, lieu, catégorie, stats engagement.');
SELECT public._loop_set_table_comment('establishment_photos',
  'Photos d''un spot (establishments) — URL, ordre, photo principale.');
SELECT public._loop_set_table_comment('establishment_schedules',
  'Horaires d''ouverture d''un spot.');
SELECT public._loop_set_table_comment('establishment_ratings',
  'Note utilisateur (1–5) par compte et par spot.');
SELECT public._loop_set_table_comment('tools',
  'Catalogue outils THE LOOP (séparé des spots / establishments).');
SELECT public._loop_set_table_comment('tool_photos',
  'Photos / logo des outils.');
SELECT public._loop_set_table_comment('tool_ratings',
  'Note utilisateur (1–5) par compte et par outil.');
SELECT public._loop_set_table_comment('locations',
  'Lieux géographiques normalisés (ville, quartier, coordonnées).');
SELECT public._loop_set_table_comment('guinea_locations',
  'Référentiel admin Guinée : région → préfecture → commune → quartier (district).');
SELECT public._loop_set_table_comment('content_categories',
  'Source unique catégories (event, spot, tool) — référencées via category_slugs sur le contenu.');
SELECT public._loop_set_table_comment('hero_banners',
  'Bannières hero accueil — lien vers événement ou spot publié.');

-- ─── Favoris & engagement ────────────────────────────────────────────────────
SELECT public._loop_set_table_comment('favorite_events',
  'Favoris événements par utilisateur.');
SELECT public._loop_set_table_comment('favorite_spots',
  'Favoris spots (establishments) par utilisateur.');
SELECT public._loop_set_table_comment('favorite_tools',
  'Favoris outils par utilisateur.');
SELECT public._loop_set_table_comment('favorite_walks',
  'Favoris parcours Loop Walks par utilisateur.');
SELECT public._loop_set_table_comment('walk_ratings',
  'Note utilisateur (1–5) par compte et par parcours.');
SELECT public._loop_set_table_comment('user_favorite_events',
  'Favoris événements (schéma legacy — remplacé par favorite_events si migré).');
SELECT public._loop_set_table_comment('user_favorite_locations',
  'Favoris lieux (schéma legacy).');

-- ─── Loop Walks & Accueil ────────────────────────────────────────────────────
SELECT public._loop_set_table_comment('loop_walks',
  'Parcours guidés Loop Walks — étapes JSON, durée, mise en avant semaine.');
SELECT public._loop_set_table_comment('home_polls',
  'Sondages page d''accueil — question, options, fenêtre de publication.');
SELECT public._loop_set_table_comment('home_poll_votes',
  'Votes utilisateurs sur les sondages accueil (identité compte ou téléphone).');
SELECT public._loop_set_table_comment('home_partner_logos',
  'Logos partenaires affichés sur l''accueil (carrousel / bandeau).');
SELECT public._loop_set_table_comment('creator_corner_features',
  'Mises en avant Creator Corner — créateurs locaux sur l''accueil.');

-- ─── Avantages, PASS & octrois ───────────────────────────────────────────────
SELECT public._loop_set_table_comment('benefit_catalog',
  'Catalogue avantages THE LOOP — modèles, partenaires associés, activation, validité.');
SELECT public._loop_set_table_comment('prime_benefit_grants',
  'Octrois avantages catalogue aux membres (Prime / ciblé / automatique).');
SELECT public._loop_set_table_comment('scheduled_benefit_grants',
  'Octrois avantages programmés (date future).');
SELECT public._loop_set_table_comment('user_pass_grants',
  'Historique des PASS octroyés (Heritage et catalogue custom) — source cloud mobile.');
SELECT public._loop_set_table_comment('benefit_redemptions',
  'Validations consommation d''avantage — scan QR partenaire, membre, lieu.');
SELECT public._loop_set_table_comment('partner_benefit_offers',
  'Demandes de validation avantage catalogue — sync admin mobile ↔ espace partenaire.');
SELECT public._loop_set_table_comment('staff_benefit_overrides',
  'Pack avantages équipe admin — activation par membre staff.');
SELECT public._loop_set_table_comment('admin_benefit_draws',
  'Tirages au sort avantages admin — gagnants et catalogues associés.');

-- ─── Partenaires Pro ─────────────────────────────────────────────────────────
SELECT public._loop_set_table_comment('partner_tokens',
  'Jetons d''accès espace partenaire (SPOT-XXXX) — liaison compte auth.');
SELECT public._loop_set_table_comment('partner_staff',
  'Fiche staff partenaire — lien user_id ↔ établissements gérés.');
SELECT public._loop_set_table_comment('partner_event_submissions',
  'Soumissions événements partenaire (staging → modération → publication events).');
SELECT public._loop_set_table_comment('partner_spot_submissions',
  'Soumissions spots/outils partenaire (staging → modération → establishments/tools).');
SELECT public._loop_set_table_comment('partner_validation_codes',
  'Codes QR validation partenaire — scan membre / avantage.');
SELECT public._loop_set_table_comment('partner_milestone_rules',
  'Règles paliers récompenses partenaire (seuils validations).');
SELECT public._loop_set_table_comment('partner_milestone_periods',
  'Périodes de calcul des paliers partenaire.');
SELECT public._loop_set_table_comment('partner_milestone_rewards',
  'Récompenses paliers débloquées pour un partenaire (à la une, push, etc.).');
SELECT public._loop_set_table_comment('partner_member_attributions',
  'Attribution membre ↔ partenaire (parrainage, QR, campagne).');

-- ─── Notifications, parrainage, invitations ──────────────────────────────────
SELECT public._loop_set_table_comment('user_notifications',
  'Notifications in-app par utilisateur (ou par téléphone) — titres, audience, campaign_id optionnel.');
SELECT public._loop_set_table_comment('admin_push_campaigns',
  'Campagnes push admin — ciblage, contenu, statut d''envoi.');
SELECT public._loop_set_table_comment('referral_settings',
  'Paramètres programme parrainage (pays, récompenses, activation).');
SELECT public._loop_set_table_comment('referrals',
  'Liens parrain filleul — code utilisé à l''inscription.');
SELECT public._loop_set_table_comment('referral_rewards',
  'Récompenses parrainage créditées (avantages, points, statut).');
SELECT public._loop_set_table_comment('prime_invitations',
  'Invitations Loop Prime — jetons VIP et activation compte.');

-- ─── Admin, automation, config ───────────────────────────────────────────────
SELECT public._loop_set_table_comment('admin_automation_jobs',
  'Jobs planifiés admin — matching ville compte / ville avantage catalogue.');
SELECT public._loop_set_table_comment('partnership_notes',
  'Notes internes admin sur une demande de partenariat.');
SELECT public._loop_set_table_comment('partnership_requests',
  'Demandes de partenariat entrantes (formulaire public → modération admin).');
SELECT public._loop_set_table_comment('partner_partnership_applications',
  'Candidatures partenaire (legacy — flux onboarding pro).');
SELECT public._loop_set_table_comment('partner_location_submissions',
  'Propositions de nouveaux lieux par des partenaires (legacy).');
SELECT public._loop_set_table_comment('community_suggestions',
  'Suggestions communauté — idées lieux ou événements soumises par les membres.');
SELECT public._loop_set_table_comment('app_settings',
  'Configuration applicative clé/valeur (sections, bannières, types avantages JSON).');
SELECT public._loop_set_table_comment('app_legal_content',
  'Textes légaux (CGU, confidentialité) versionnés par langue / contexte.');

-- ─── Paiements ───────────────────────────────────────────────────────────────
SELECT public._loop_set_table_comment('payment_intents',
  'Commandes PASS Djomy — créées et finalisées uniquement par le serveur de paiement.');

-- ─── Étoiles spots (engagement) ──────────────────────────────────────────────
SELECT public._loop_set_table_comment('spot_star_settings',
  'Paramètres calcul étoiles spots — pondération clics, favoris, notes par pays.');
SELECT public._loop_set_table_comment('spot_star_tiers',
  'Paliers étoiles (seuils → nombre d''étoiles affichées).');
SELECT public._loop_set_table_comment('spot_star_calc_runs',
  'Historique des exécutions du calcul automatique d''étoiles.');

-- ─── Legacy / messagerie (schéma initial, peu ou pas utilisé en prod mobile) ───
SELECT public._loop_set_table_comment('handshake_requests',
  'Demandes de contact LoopX / Black Loop (legacy messagerie).');
SELECT public._loop_set_table_comment('conversations',
  'Fil de conversation (legacy messagerie in-app).');
SELECT public._loop_set_table_comment('conversation_participants',
  'Participants d''une conversation (legacy).');
SELECT public._loop_set_table_comment('messages',
  'Messages échangés dans une conversation (legacy).');
SELECT public._loop_set_table_comment('analytics_events',
  'Événements analytics bruts (tracking comportement — legacy / insights).');

-- ─── Rapport ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '=== Tables public documentées (COMMENT non vide) ===';
  FOR r IN
    SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND obj_description(c.oid, 'pg_class') IS NOT NULL
    ORDER BY c.relname
  LOOP
    RAISE NOTICE '% — %', r.table_name, r.comment;
  END LOOP;
END $$;

-- Fonction utilitaire temporaire — commentaire la ligne suivante pour la conserver
DROP FUNCTION public._loop_set_table_comment(text, text);
