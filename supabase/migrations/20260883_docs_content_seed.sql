-- Contenu éditorial DocumentationsTheLoop/content → tables app_*
-- Généré par scripts/generate-docs-content-seed.mjs — régénérer plutôt que d'éditer à la main.

-- ── Pages informatives (À propos, Comment ça marche, …) ─────────────────────
CREATE TABLE IF NOT EXISTS public.app_content_pages (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_content_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read content pages" ON public.app_content_pages;
CREATE POLICY "Public read content pages"
  ON public.app_content_pages FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage content pages" ON public.app_content_pages;
CREATE POLICY "Admin manage content pages"
  ON public.app_content_pages FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── FAQ ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_faq (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_faq_active_order
  ON public.app_faq (is_active, display_order);

ALTER TABLE public.app_faq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active faq" ON public.app_faq;
CREATE POLICY "Public read active faq"
  ON public.app_faq FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage faq" ON public.app_faq;
CREATE POLICY "Admin manage faq"
  ON public.app_faq FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.app_legal_content IS
  'Textes légaux : cgu, privacy_policy, partner_terms, mentions_legales, conditions_pass_prime, politique_cookies';


INSERT INTO public.app_content_pages (key, title, body, updated_at)
VALUES ('a_propos', 'À propos de THE LOOP', $content$The Loop est le guide premium de Conakry : une sélection curatée des meilleurs spots, événements et outils de la ville, pensée pour les cadres locaux et la diaspora africaine exigeante.

Notre conviction : les bonnes adresses ne s'annoncent pas, elles se transmettent. C'est cette logique de cercle de confiance que nous avons voulu recréer dans l'application — un répertoire où chaque lieu référencé est choisi, pas juste listé.

Né à Conakry, THE LOOP est pensé pour grandir avec l'Afrique : après la Guinée, l'ambition est d'accompagner les mêmes usages — sortir, découvrir, se faire plaisir — dans d'autres capitales du continent.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_content_pages (key, title, body, updated_at)
VALUES ('comment_ca_marche', 'Comment ça marche', $content$1. Téléchargez l'application
THE LOOP est disponible gratuitement sur Google Play et l'App Store.

2. Créez votre compte
L'inscription se fait en quelques secondes avec votre numéro de téléphone et un code de vérification (OTP) — aucun mot de passe à retenir.

3. Explorez la ville autrement
Parcourez les spots, événements et outils sélectionnés à Conakry, filtrez selon vos envies, et ajoutez vos adresses favorites.

4. Activez le PASS Prime
Pour débloquer les avantages exclusifs chez nos partenaires (accueil privilégié, offres, accès prioritaire...), souscrivez au PASS Prime, un abonnement mensuel réglable directement via Djomy.

5. Restez informé et donnez votre avis
Recevez des notifications sur vos favoris, vos avantages et les actualités de l'application, et participez de temps en temps à nos sondages pour orienter les prochaines sélections de THE LOOP.

6. Profitez de vos privilèges
Présentez votre carte membre chez nos partenaires et profitez des avantages réservés au cercle THE LOOP.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_content_pages (key, title, body, updated_at)
VALUES ('devenir_partenaire', 'Devenir partenaire THE LOOP', $content$Faites découvrir votre établissement à une communauté ciblée de cadres et de décideurs à Conakry, et gagnez en visibilité auprès de la diaspora africaine en quête de bonnes adresses.

En rejoignant THE LOOP, votre établissement bénéficie :
- D'une fiche dédiée dans l'application (description, photos, horaires, contact, réservation)
- D'un accès à la communauté des membres PASS Prime
- D'un QR code personnalisé avec suivi de fréquentation (tracking UTM)
- D'une visibilité éditoriale sur les avantages que vous choisissez d'offrir aux membres

THE LOOP se réserve un droit de sélection éditoriale sur les établissements référencés, afin de garantir la qualité de l'expérience proposée à ses membres.

Pour candidater, contactez-nous à contact@theloop.gn.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_content_pages (key, title, body, updated_at)
VALUES ('contact', 'Contact', $content$Une question, une suggestion de spot, ou une envie de rejoindre THE LOOP en tant que partenaire ?

Écrivez-nous à contact@theloop.gn — nous répondons personnellement à chaque message.

THE LOOP est basé à Conakry, Guinée.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('cgu', 'Conditions générales d''utilisation', $content$1. Objet
Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application THE LOOP, plateforme de découverte de lieux, d'événements et d'outils à Conakry.

2. Création de compte
L'inscription nécessite un numéro de téléphone valide et une vérification par code (OTP). L'utilisateur s'engage à fournir des informations exactes et à jour (nom, e-mail, date de naissance). L'usage de l'application est réservé aux personnes majeures ou légalement autorisées dans leur juridiction.

3. Données personnelles
En créant un compte, vous acceptez que vos données personnelles (nom, téléphone, e-mail, date de naissance) soient utilisées uniquement par THE LOOP pour la gestion de votre profil membre, vos favoris, notifications, PASS Prime, avantages et sondages. Vos informations ne sont pas revendues à des tiers. Pour plus de détails, consultez notre Politique de confidentialité.

4. Utilisation du service
L'utilisateur s'engage à ne pas détourner l'application de son usage prévu, à ne pas publier de contenu illicite, trompeur ou portant atteinte aux droits de tiers, et à respecter les conditions spécifiques des partenaires référencés.

5. Avantages et PASS Prime
Certains avantages, réductions ou accès privilégiés sont soumis à un abonnement PASS Prime, dont les conditions spécifiques sont détaillées dans un document dédié. THE LOOP ne garantit pas la disponibilité permanente de chaque avantage, qui dépend des établissements partenaires.

6. Sondages et enquêtes
THE LOOP peut proposer des sondages ou enquêtes au sein de l'application afin de mieux comprendre les préférences de ses membres. La participation est facultative. Les réponses individuelles ne sont jamais rendues publiques ; seuls des résultats agrégés et anonymisés (pourcentages, tendances globales) peuvent être communiqués.

7. Notifications
L'utilisateur peut recevoir des notifications au sein de l'application et/ou sur son appareil (favoris, avantages PASS Prime, sondages, actualités de l'application).

8. Résiliation
L'utilisateur peut demander la suppression de son compte à tout moment en contactant le service clientèle. THE LOOP se réserve le droit de suspendre ou résilier un compte en cas de non-respect des présentes CGU.

9. Modification des CGU
THE LOOP peut modifier les présentes CGU à tout moment. Les utilisateurs seront informés de toute modification substantielle via l'application.

10. Droit applicable
Les présentes CGU sont soumises au droit guinéen. Tout litige relève de la compétence des juridictions compétentes de Conakry.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('privacy_policy', 'Politique de confidentialité', $content$1. Données collectées
THE LOOP collecte les données suivantes lors de l'inscription et de l'utilisation de l'application : nom, prénom, numéro de téléphone, e-mail, date de naissance, ainsi que les données d'usage (favoris, avantages activés, notifications reçues, réponses aux sondages et enquêtes proposés dans l'application).

2. Finalité du traitement
Ces données sont utilisées exclusivement pour : la gestion du compte membre, la personnalisation des recommandations (spots, événements, outils), l'envoi de notifications (in-app et push) liées aux favoris, au PASS Prime, aux sondages et aux actualités de l'application, l'attribution des avantages partenaires, et la réalisation de sondages internes visant à mieux comprendre les préférences des membres. Les résultats de ces sondages ne sont jamais publiés de façon individuelle ou nominative ; seules des données agrégées et anonymisées (ex. pourcentages, tendances globales) peuvent être communiquées, en interne comme en externe.

3. Partage des données
Vos données ne sont ni vendues ni louées à des tiers. Elles peuvent être partagées avec un partenaire uniquement dans la mesure nécessaire à l'activation d'un avantage que vous avez vous-même sollicité (ex. présentation d'une carte membre), avec Djomy pour le traitement des paiements PASS Prime, et avec Firebase Cloud Messaging (Google) pour l'envoi technique des notifications.

4. Conservation des données
Vos données, y compris vos réponses aux sondages, sont conservées pendant toute la durée de votre compte actif. En cas de suppression de compte, elles sont supprimées ou anonymisées dans un délai raisonnable, sauf obligation légale de conservation.

5. Sécurité
THE LOOP met en œuvre les mesures techniques raisonnables pour protéger vos données contre tout accès non autorisé, perte ou divulgation.

6. Vos droits
Vous pouvez à tout moment demander l'accès, la rectification ou la suppression de vos données personnelles, y compris vos réponses à des sondages, en écrivant à contact@theloop.gn.

7. Authentification
La connexion à l'application se fait par code de vérification (OTP) envoyé par SMS, sans stockage de mot de passe.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('conditions_pass_prime', 'Conditions du PASS Prime', $content$1. Description
Le PASS Prime est un abonnement optionnel donnant accès à des avantages exclusifs auprès des établissements partenaires de THE LOOP (accueil privilégié, offres, accès prioritaire, etc.), selon les conditions propres à chaque partenaire.

2. Souscription et paiement
Le PASS Prime est proposé sous forme d'abonnement mensuel. Le paiement s'effectue via Djomy, agrégateur de paiement mobile money opérant en Guinée.

3. Renouvellement
Le renouvellement du PASS Prime n'est pas automatique. Chaque mois, l'utilisateur doit effectuer manuellement un nouveau paiement via Djomy pour prolonger son accès aux avantages Prime. À défaut de renouvellement, l'accès Prime prend fin à l'issue de la période déjà payée.

4. Annulation
Le PASS Prime étant sans renouvellement automatique, aucune procédure d'annulation n'est nécessaire : il suffit de ne pas effectuer le paiement du mois suivant pour que l'abonnement prenne fin naturellement.

5. Remboursement
Le paiement du PASS Prime étant effectué mois par mois et de façon volontaire, aucun remboursement n'est prévu pour la période déjà payée et activée.

6. Disponibilité des avantages
Les avantages listés dans l'application sont proposés par les établissements partenaires et peuvent être modifiés, suspendus ou retirés à tout moment par THE LOOP ou par le partenaire concerné, sans que cela ouvre droit à un remboursement du PASS Prime.

7. Usage personnel
Le PASS Prime est nominatif et réservé à l'usage du membre titulaire du compte, sauf mention contraire explicite d'un avantage (ex. avantage extensible à un invité).$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('partner_terms', 'Conditions partenaires', $content$THE LOOP se réserve le droit de retirer toute publication (événement, spot, outil) sans obligation de justification, notamment en cas de non-conformité, signalement ou décision éditoriale. Les partenaires sont informés que le contenu publié peut être désactivé à tout moment par l'équipe THE LOOP.$content$, '2026-08-15 13:40:46.146027+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('politique_cookies', 'Politique de cookies', $content$1. Utilisation des cookies
Le site web de THE LOOP peut utiliser des cookies et technologies similaires pour assurer le bon fonctionnement de la plateforme, mesurer l'audience et améliorer l'expérience utilisateur.

2. Types de cookies
- Cookies strictement nécessaires : indispensables au fonctionnement du site (connexion, sécurité).
- Cookies de mesure d'audience : [À compléter selon les outils analytics utilisés, le cas échéant]

3. Gestion des cookies
Vous pouvez configurer votre navigateur pour refuser les cookies non essentiels. Ce refus peut affecter certaines fonctionnalités du site.

4. Contact
Pour toute question relative à cette politique : contact@theloop.gn$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES ('mentions_legales', 'Mentions légales', $content$Éditeur
THE LOOP — application mobile de découverte et d'expériences à Conakry (Guinée), disponible sur Google Play et l'App Store. Activité actuellement exploitée à titre individuel, en cours de structuration juridique.
Contact : contact@theloop.gn
Directeur de la publication
[À compléter dès formalisation de la structure]
Hébergement
Supabase Inc. — hébergement de la base de données et de l'authentification.
Vercel Inc. — hébergement du site web (landing page).
Distribution de l'application : Google Play Store (Google LLC) et Apple App Store (Apple Inc.).
Paiement
Les paiements liés au PASS Prime sont traités par Djomy, agrégateur de paiement mobile money.
Données personnelles
Les données collectées lors de l'inscription (nom, e-mail, téléphone, date de naissance) sont traitées par THE LOOP pour la gestion du compte membre, des favoris, notifications et avantages Loop Prime. Pour toute demande d'accès, rectification ou suppression : contact@theloop.gn
Propriété intellectuelle
L'ensemble des contenus, marques et éléments graphiques de THE LOOP sont protégés. Toute reproduction non autorisée est interdite.$content$, '2026-08-23 00:00:00.000000+00'::timestamptz)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-001',
  'Qu''est-ce que THE LOOP ?',
  $content$THE LOOP est une application de conciergerie et de découverte qui met en avant une sélection curatée de spots, d'événements et d'outils à Conakry, pensée pour les cadres locaux et la diaspora africaine.$content$,
  'general',
  1,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-002',
  'L''application est-elle disponible sur mon téléphone ?',
  $content$Oui, THE LOOP est disponible gratuitement sur Google Play (Android) et sur l'App Store (iOS).$content$,
  'general',
  2,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-003',
  'Comment créer un compte ?',
  $content$L'inscription se fait avec votre numéro de téléphone. Un code de vérification (OTP) vous est envoyé par SMS pour confirmer votre identité — aucun mot de passe n'est nécessaire.$content$,
  'compte',
  3,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-004',
  'Qu''est-ce que le PASS Prime ?',
  $content$Le PASS Prime est un abonnement mensuel qui donne accès à des avantages exclusifs (accueil privilégié, offres, accès prioritaire...) chez les établissements partenaires de THE LOOP.$content$,
  'pass_prime',
  4,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-005',
  'Comment payer mon PASS Prime ?',
  $content$Le paiement s'effectue via Djomy, agrégateur de paiement mobile money disponible en Guinée.$content$,
  'pass_prime',
  5,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-006',
  'Le PASS Prime se renouvelle-t-il automatiquement ?',
  $content$Non. Le renouvellement n'est pas automatique : chaque mois, vous devez effectuer un nouveau paiement via Djomy pour prolonger votre accès aux avantages Prime. Si vous ne renouvelez pas, votre accès Prime s'arrête simplement à la fin de la période déjà payée — aucune démarche d'annulation n'est nécessaire.$content$,
  'pass_prime',
  6,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-007',
  'Puis-je me faire rembourser mon PASS Prime ?',
  $content$Le PASS Prime étant payé mois par mois et de façon volontaire, aucun remboursement n'est prévu pour une période déjà payée et activée.$content$,
  'pass_prime',
  7,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-008',
  'Comment devenir partenaire THE LOOP ?',
  $content$Envoyez-nous un message à contact@theloop.gn. Notre équipe étudie chaque candidature afin de garantir la qualité de la sélection proposée aux membres.$content$,
  'partenaires',
  8,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-009',
  'Mes données personnelles sont-elles protégées ?',
  $content$Oui. Vos données ne sont jamais revendues à des tiers et sont utilisées uniquement pour la gestion de votre compte, vos favoris, vos notifications et vos avantages Prime. Vous pouvez demander leur modification ou suppression à tout moment via contact@theloop.gn.$content$,
  'confidentialite',
  9,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-010',
  'Comment supprimer mon compte ?',
  $content$Contactez notre service clientèle à contact@theloop.gn pour demander la suppression de votre compte et de vos données associées.$content$,
  'compte',
  10,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-011',
  'Comment sont utilisées mes réponses aux sondages ?',
  $content$Vos réponses individuelles restent en base et ne sont jamais publiées nominativement. Seuls des résultats agrégés et anonymisés (ex. pourcentages, tendances) peuvent être communiqués, en interne ou en externe, pour orienter les futures sélections de THE LOOP.$content$,
  'confidentialite',
  11,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-012',
  'Suis-je obligé de répondre aux sondages ?',
  $content$Non, la participation aux sondages proposés dans l'application est toujours facultative.$content$,
  'confidentialite',
  12,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_faq (id, question, answer, category, display_order, is_active, updated_at)
VALUES (
  'faq-013',
  'Quelles notifications vais-je recevoir ?',
  $content$Vous pouvez recevoir des notifications dans l'application et sur votre appareil concernant vos favoris, vos avantages PASS Prime, les sondages en cours et les actualités de THE LOOP.$content$,
  'general',
  13,
  true,
  '2026-08-23 00:00:00.000000+00'::timestamptz
)
ON CONFLICT (id) DO UPDATE SET
  question = EXCLUDED.question,
  answer = EXCLUDED.answer,
  category = EXCLUDED.category,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;
