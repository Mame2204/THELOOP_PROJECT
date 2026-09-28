/**
 * Textes légaux unifiés — source unique pour l'app (écran légal) et la landing
 * (www.theloop-app.com/cgu, /privacy, /mentions chargent app_legal_content).
 * Alignés sur l'app actuelle : connexion e-mail + mot de passe, suppression de compte
 * dans l'app, anonymisation, prestataires techniques, PASS Prime.
 *
 * Remplace les versions existantes (éditables ensuite depuis Control Tower → Légal).
 * Idempotent — safe à relancer.
 */

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'cgu',
  'Conditions générales d''utilisation',
  $txt$1. Objet
Les présentes Conditions Générales d'Utilisation (CGU) régissent l'accès et l'utilisation de l'application THE LOOP, plateforme de découverte de lieux, d'événements et d'outils à Conakry et dans les villes où THE LOOP est disponible, ainsi que du site www.theloop-app.com.

2. Création de compte
L'inscription se fait dans l'application avec une adresse e-mail et un mot de passe, directement ou sur invitation de THE LOOP. Un code envoyé par e-mail peut être demandé pour activer une invitation ou réinitialiser le mot de passe. L'utilisateur s'engage à fournir des informations exactes et à jour (nom, e-mail, téléphone, ville) et à garder son mot de passe confidentiel. L'usage de l'application est réservé aux personnes majeures ou légalement autorisées dans leur juridiction.

3. Données personnelles
En créant un compte, vous acceptez que vos données personnelles soient utilisées uniquement par THE LOOP pour la gestion de votre profil membre, vos favoris, notifications, PASS Prime, privilèges et sondages. Vos informations ne sont ni vendues ni louées à des tiers. Pour plus de détails, consultez notre Politique de confidentialité.

4. Utilisation du service
L'utilisateur s'engage à ne pas détourner l'application de son usage prévu, à ne pas publier de contenu illicite, trompeur ou portant atteinte aux droits de tiers, et à respecter les conditions spécifiques des partenaires référencés. La carte membre (QR code) est personnelle et ne doit pas être partagée.

5. Privilèges et PASS Prime
Les privilèges (réductions, accueil privilégié, accès prioritaire…) sont proposés par les établissements partenaires et consommés sur place, sur présentation de la carte membre. Certains privilèges sont réservés aux titulaires du PASS Prime, dont les conditions figurent dans le document « Conditions du PASS Prime ». THE LOOP ne garantit pas la disponibilité permanente de chaque privilège, qui dépend des établissements partenaires.

6. Sondages et enquêtes
THE LOOP peut proposer des sondages ou enquêtes au sein de l'application afin de mieux comprendre les préférences de ses membres. La participation est facultative. Les réponses individuelles ne sont jamais rendues publiques ; seuls des résultats agrégés et anonymisés (pourcentages, tendances globales) peuvent être communiqués.

7. Notifications
L'utilisateur peut recevoir des notifications au sein de l'application et sur son appareil (favoris, privilèges, PASS Prime, sondages, actualités). Les notifications sur l'appareil peuvent être désactivées à tout moment dans les réglages du téléphone.

8. Suppression du compte et résiliation
L'utilisateur peut demander la suppression de son compte à tout moment : dans l'application (Profil → Paramètres → Fermer mon compte), sur la page www.theloop-app.com/suppression, par e-mail à contact@theloop-app.com ou par téléphone / WhatsApp au +224 626 68 06 06. La demande est traitée sous 30 jours maximum. THE LOOP se réserve le droit de suspendre ou résilier un compte en cas de non-respect des présentes CGU.

9. Modification des CGU
THE LOOP peut modifier les présentes CGU à tout moment. Les utilisateurs seront informés de toute modification substantielle via l'application.

10. Droit applicable
Les présentes CGU sont soumises au droit guinéen. Tout litige relève de la compétence des juridictions compétentes de Conakry.

Contact
Site : www.theloop-app.com
E-mail : contact@theloop-app.com
Téléphone / WhatsApp : +224 626 68 06 06$txt$,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'privacy_policy',
  'Politique de confidentialité',
  $txt$1. Responsable du traitement
THE LOOP — Conakry, Guinée.
Site : www.theloop-app.com
Contact : contact@theloop-app.com · +224 626 68 06 06

2. Données collectées
Compte : prénom, nom, adresse e-mail, mot de passe, numéro de téléphone, pays, commune ou quartier, date de naissance (facultative) et code de parrainage. Le mot de passe est stocké chiffré (haché) par notre prestataire d'authentification : THE LOOP ne peut jamais le lire.
Comptes partenaires : nom de l'établissement, fonction, coordonnées professionnelles, ainsi que les textes et photos publiés dans l'application.
Utilisation : favoris, privilèges demandés et validés (établissement, date), historique du PASS Prime, parrainages, notifications reçues, réponses aux sondages et suggestions envoyées.
Paiement : lors d'un achat du PASS Prime, le montant, la date et le numéro mobile money utilisé. Aucune donnée de carte bancaire n'est collectée ni stockée par THE LOOP.
Appareil : un identifiant technique de notification (fourni par Apple ou Google) pour vous envoyer des notifications.
Caméra et photos : la caméra sert uniquement à scanner les QR codes lors de la validation des privilèges ; aucune image n'est enregistrée. Seules les photos que vous choisissez d'envoyer (comptes partenaires) sont conservées.
THE LOOP ne collecte pas votre localisation GPS, vos contacts, votre micro ni de données publicitaires. L'application ne contient ni publicité ni outil de suivi publicitaire.
Site web : la liste d'attente collecte uniquement l'adresse e-mail.

3. Finalités du traitement
Ces données sont utilisées exclusivement pour : la gestion du compte membre et de la carte membre, la personnalisation des recommandations (spots, événements, outils), l'attribution et la validation des privilèges partenaires, la gestion du PASS Prime et du parrainage, l'envoi de notifications (in-app et push), la réalisation de sondages internes et la prévention des abus (sécurité des comptes, limitation des tentatives). Les résultats des sondages ne sont jamais publiés de façon individuelle ou nominative ; seules des données agrégées et anonymisées peuvent être communiquées.

4. Partage des données
Vos données ne sont ni vendues ni louées. Elles sont partagées uniquement :
- avec l'établissement partenaire, lorsque vous présentez votre carte membre pour un privilège (prénom, nom, numéro de téléphone, statut de membre et privilège demandé) ;
- avec nos prestataires techniques, qui agissent pour le compte de THE LOOP et n'utilisent pas vos données pour leur propre compte : Supabase (hébergement de la base de données, authentification et fichiers), Expo, Google Firebase Cloud Messaging et Apple Push Notification Service (notifications), Djomy (paiement mobile money), Render (serveur de paiement) et Vercel (site web).

5. Conservation des données
Vos données sont conservées pendant toute la durée de votre compte. Après une demande de suppression, le compte et les données associées sont supprimés sous 30 jours maximum. Lorsque des éléments doivent être conservés (contenu publié par un partenaire, historique des privilèges pour les établissements), le compte est anonymisé : nom, e-mail, téléphone, date de naissance, favoris et notifications sont effacés et la connexion est définitivement bloquée. Les informations de paiement sont conservées pendant la durée exigée par la réglementation comptable. Les e-mails de la liste d'attente sont conservés jusqu'au lancement ou jusqu'à votre demande de retrait.

6. Sécurité
Les échanges sont chiffrés (HTTPS). L'accès aux données est limité selon le rôle de chaque compte (membre, partenaire, administrateur), les mots de passe sont stockés chiffrés et les tentatives répétées sont limitées.

7. Vos droits
Vous pouvez à tout moment accéder à vos données et les rectifier (Profil → Modifier le profil), ou demander leur suppression :
- dans l'application : Profil → Paramètres → Fermer mon compte ;
- sur la page www.theloop-app.com/suppression ;
- par e-mail à contact@theloop-app.com ou par téléphone / WhatsApp au +224 626 68 06 06.
Pour retirer uniquement votre e-mail de la liste d'attente du site, écrivez à la même adresse avec l'objet « Retrait waitlist ».

8. Authentification
La connexion se fait par adresse e-mail et mot de passe. Un code envoyé par e-mail peut être demandé pour activer une invitation ou réinitialiser le mot de passe.

9. Mineurs
L'application est réservée aux personnes majeures. THE LOOP ne collecte pas sciemment de données concernant des mineurs.

10. Modification de la politique
Cette politique peut évoluer avec l'application. Toute modification substantielle est signalée dans l'application.$txt$,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'mentions_legales',
  'Mentions légales',
  $txt$Éditeur
THE LOOP — application mobile de découverte et d'expériences à Conakry (Guinée), disponible sur Google Play et l'App Store. Activité actuellement exploitée à titre individuel, en cours de structuration juridique.
Contact : contact@theloop-app.com · +224 626 68 06 06

Hébergement et prestataires techniques
Supabase Inc. — base de données, authentification et fichiers.
Render Services Inc. — serveur de paiement.
Vercel Inc. — site web www.theloop-app.com.
Expo (650 Industries Inc.), Google Firebase Cloud Messaging et Apple Push Notification Service — envoi des notifications.
Distribution de l'application : Google Play (Google LLC) et App Store (Apple Inc.).

Paiement
Les paiements liés au PASS Prime sont traités par Djomy, agrégateur de paiement mobile money.

Données personnelles
Le traitement des données personnelles est décrit dans la Politique de confidentialité. Pour toute demande d'accès, de rectification ou de suppression : contact@theloop-app.com, ou dans l'application : Profil → Paramètres → Fermer mon compte.

Propriété intellectuelle
L'ensemble des contenus, marques et éléments graphiques de THE LOOP sont protégés. Toute reproduction non autorisée est interdite. Les contenus publiés par les partenaires restent sous leur responsabilité.$txt$,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'conditions_pass_prime',
  'Conditions du PASS Prime',
  $txt$1. Description
Le PASS Prime est un titre d'accès nominatif, à durée limitée, qui donne droit à des privilèges consommés sur place auprès des établissements partenaires de THE LOOP (accueil privilégié, offres, réductions, accès prioritaire…), selon les conditions propres à chaque partenaire.

2. Obtention
Le PASS Prime peut être attribué par THE LOOP (parrainage selon les règles affichées dans l'application, invitation, opérations spéciales) ou, lorsque l'achat est proposé, acheté pour une durée déterminée (par exemple un mois).

3. Paiement
Lorsque l'achat est proposé, le paiement s'effectue par mobile money via Djomy, agrégateur de paiement opérant en Guinée. Le prix et la durée sont affichés avant la confirmation du paiement.

4. Renouvellement et annulation
Le PASS Prime n'est pas renouvelé automatiquement. À la fin de la période, l'accès aux privilèges Prime prend fin, sauf nouvel achat ou nouvelle attribution. Aucune démarche d'annulation n'est donc nécessaire.

5. Remboursement
Une période payée et activée n'est pas remboursable. En cas d'erreur de paiement, contactez contact@theloop-app.com.

6. Disponibilité des privilèges
Les privilèges affichés dans l'application sont proposés par les établissements partenaires et peuvent être modifiés, suspendus ou retirés à tout moment par THE LOOP ou par le partenaire concerné, sans que cela ouvre droit à un remboursement.

7. Usage personnel
Le PASS Prime est nominatif et réservé au membre titulaire du compte, sauf mention contraire explicite d'un privilège (ex. privilège extensible à un invité).$txt$,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;

INSERT INTO public.app_legal_content (key, title, body, updated_at)
VALUES (
  'politique_cookies',
  'Politique de cookies',
  $txt$1. Site web
Le site www.theloop-app.com n'utilise aucun cookie de mesure d'audience ni de publicité. Le formulaire de liste d'attente envoie uniquement votre adresse e-mail.

2. Application
L'application THE LOOP n'utilise pas de cookies. Elle conserve sur votre appareil les informations nécessaires à votre session et un cache du contenu, pour fonctionner plus rapidement. Ces données sont effacées à la désinstallation de l'application.

3. Contact
Pour toute question relative à cette politique : contact@theloop-app.com$txt$,
  NOW()
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at;
