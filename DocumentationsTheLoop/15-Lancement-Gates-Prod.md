# Gates lancement (phase D)

Contrôle sans rebuild via super admin mobile → **Paramètres**.

| Gate | Défaut code | Usage lancement |
|------|-------------|-----------------|
| Inscription (`signupEnabled`) | **OFF** (invite-only) | Rester OFF jusqu’à ouverture contrôlée |
| Achat PASS (`passPurchaseEnabled`) | **OFF** | ON seulement pour tests / go-live paiement |
| Pré-lancement | OFF | Message / countdown si besoin |
| Maintenance | OFF | Coupure urgente |

## Vente PASS — prête, interrupteur coupé

La vente fonctionne de bout en bout, gate OFF ou ON. Gate OFF : aucun bouton ni texte n'invite à acheter, le serveur refuse `/api/create-payment` (403) et la notification d'expiration ne parle pas de renouvellement.

### Déploiement (une fois)

1. Supabase, dans l'ordre : `20260956`, `20260957` (PR #74), puis `20260958_pass_payment_integrity.sql`.
2. Redéployer le serveur de paiement (Render) **après** la 958. Tant qu'elle n'est pas appliquée, le serveur repasse sur l'ancien chemin de livraison, donc rien ne casse.
3. Contrôle rapide après la 958 (éditeur SQL Supabase) : toutes les lignes doivent afficher **OK**.

```sql
SELECT controle, resultat, attendu, CASE WHEN resultat = attendu THEN 'OK' ELSE 'À REGARDER' END AS verdict
FROM (
  SELECT 1 AS n, 'Livraison PASS appelable par un membre' AS controle,
    has_function_privilege('authenticated', 'public.fulfill_payment_intent(uuid,text,integer)', 'EXECUTE')::text AS resultat,
    'false' AS attendu
  UNION ALL
  SELECT 2, 'Ancienne livraison PASS appelable par un membre',
    has_function_privilege('authenticated',
      'public.fulfill_djomy_pass_payment(uuid,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz,text,timestamptz,boolean,text,text)',
      'EXECUTE')::text,
    'false'
  UNION ALL
  SELECT 3, 'Garde-fou membre actif sur les créations de PASS',
    (SELECT count(*) FROM pg_trigger
     WHERE tgname = 'trg_user_pass_grants_guard_self' AND (tgtype & 4) = 4)::text,
    '1'
  UNION ALL
  SELECT 4, 'PASS sans local_id',
    (SELECT count(*) FROM public.user_pass_grants WHERE local_id IS NULL)::text,
    '0'
  UNION ALL
  SELECT 5, 'PASS en file sans commande payée',
    (SELECT count(*) FROM public.user_pass_grants g
     WHERE g.status = 'pending'
       AND NOT EXISTS (SELECT 1 FROM public.payment_intents p
                       WHERE p.local_pass_id = g.local_id AND p.fulfillment_status = 'fulfilled'))::text,
    '0'
  UNION ALL
  SELECT 6, 'PASS sans échéance, ni Heritage ni payé',
    (SELECT count(*) FROM public.user_pass_grants g
     WHERE g.status IN ('active', 'suspended')
       AND g.expires_at IS NULL
       AND NOT public.pass_grant_never_expires(
         g.pass_kind, g.label, g.payment_method, g.amount_gnf,
         g.frozen_pass_snapshot, g.pass_catalog_id, g.granted_by)
       AND NOT EXISTS (SELECT 1 FROM public.payment_intents p
                       WHERE p.local_pass_id = g.local_id AND p.fulfillment_status = 'fulfilled'))::text,
    '0'
) t
ORDER BY n;
```

   Si une ligne affiche « À REGARDER », lancer les requêtes détaillées ci-dessous :

```sql
-- Doit renvoyer false / false
SELECT
  has_function_privilege('authenticated', 'public.fulfill_payment_intent(uuid,text,integer)', 'EXECUTE') AS fulfill_ouvert,
  has_function_privilege('authenticated',
    'public.fulfill_djomy_pass_payment(uuid,text,text,text,text,timestamptz,timestamptz,integer,text,timestamptz,text,timestamptz,boolean,text,text)',
    'EXECUTE') AS ancien_fulfill_ouvert;

-- PASS en file sans commande payée : à examiner (la tâche pg_cron les activerait)
SELECT g.id, g.user_id, g.label, g.billing_period, g.created_at
FROM public.user_pass_grants g
WHERE g.status = 'pending'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_intents p
    WHERE p.local_pass_id = g.local_id AND p.fulfillment_status = 'fulfilled'
  );

-- PASS sans échéance ni Heritage, ni payé : à examiner (octroi console légitime ou auto-attribution)
SELECT g.id, g.user_id, g.label, g.pass_kind, g.status, g.granted_by, g.created_at
FROM public.user_pass_grants g
WHERE g.status IN ('active', 'suspended')
  AND g.expires_at IS NULL
  AND NOT public.pass_grant_never_expires(
    g.pass_kind, g.label, g.payment_method, g.amount_gnf,
    g.frozen_pass_snapshot, g.pass_catalog_id, g.granted_by)
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_intents p
    WHERE p.local_pass_id = g.local_id AND p.fulfillment_status = 'fulfilled'
  );
```

4. `server/scripts/verify-pass-lock.mjs` : toutes les lignes en OK.

### Règles de vente (serveur)

- Prix lus dans `pass_prices_v1_GN`, facturés en GNF (tarif Guinée quel que soit le pays exploré).
- Livraison atomique (`fulfill_payment_intent`) : webhook, polling de l'app et cron peuvent se croiser sans doublon. Sans PASS actif, le PASS est actif tout de suite et le compte passe Prime. Sinon, il se range en file et démarre à la fin du PASS en cours.
- Refus avant paiement : PASS à vie actif, PASS à vie déjà en file, file pleine (réglage boutique).
- Une commande dont le portail est encore ouvert n'est close qu'après 30 min. Un débit arrivé après une annulation est rattrapé par le cron (72 h).
- Paiement reçu mais livraison en échec : alerte admin (une seule fois), nouvel essai automatique par le cron, message clair dans l'app.

### Tests avant ouverture (Djomy sandbox, gate ON sur un compte test)

- [ ] **V1** Membre sans PASS → achat mensuel → PASS actif, rôle Prime, une seule notification « Achat confirmé »
- [ ] **V2** Prime actif → achat annuel → PASS « en file », date de début = fin du PASS en cours
- [ ] **V3** Deuxième achat en file → date de début = fin du premier PASS en file
- [ ] **V4** Portail ouvert puis paiement après 1–2 min → pas d'« annulé » dans l'app, PASS livré
- [ ] **V5** Annulation sur le portail → retour app sans PASS, commande close
- [ ] **V6** PASS à vie actif (ou en file) → achat refusé avant le portail, message clair
- [ ] **V7** Gate OFF → aucun bouton d'achat, `/api/create-payment` = 403
- [ ] **V8** Expiration d'un PASS gate OFF → notification sans « Renouvelez » ; gate ON → avec

## Supabase egress

- Monitorer Dashboard Supabase → Usage  
- Pendant tests intensifs : anticiper le passage à un plan supérieur  
- Les écrans admin paginent (users 20, paiements 30) pour limiter les lectures

## Stores

1. Builds internes (TestFlight / Play internal) avec `api.theloop-app.com`  
2. Décembre : store public + invite-only (`signupEnabled` false)  
3. Achat PASS public : plus tard, gate ON + Djomy prod
