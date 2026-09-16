# Serveur paiement THE LOOP — Djomy

Backend Node.js/Express qui isole **toutes les clés secrètes Djomy** et active le PASS **uniquement** après confirmation serveur.

## Architecture sécurisée

```
App mobile (JWT Supabase)
    │  POST /api/create-payment
    ▼
Serveur THE LOOP (secrets Djomy + service role)
    │  create_payment_gateway
    ▼
Portail Djomy (Orange Money / carte)
    │  webhook payment.success
    ▼
Serveur → verify_payment → fulfill_djomy_pass_payment (Supabase)
    │
App mobile ← poll GET /api/payments/:id/status ← sync PASS cloud
```

**Règle d'or :** l'app mobile ne reçoit jamais `DJOMY_CLIENT_SECRET` et ne peut plus activer un PASS `active` via RPC client (migration `20260827`).

## Démarrage

```powershell
# Depuis la racine du projet
.\.tools\node\npm.cmd run payment-server:install
copy server\.env.example server\.env
# Éditer server\.env (Djomy sandbox + Supabase service role)
.\.tools\node\npm.cmd run payment-server
```

## Variables d'environnement (`server/.env`)

| Variable | Description |
|----------|-------------|
| `DJOMY_CLIENT_ID` / `DJOMY_CLIENT_SECRET` | Credentials dashboard Djomy |
| `DJOMY_BASE_URL` | `https://sandbox-api.djomy.africa` ou `https://api.djomy.africa` |
| `DJOMY_PARTNER_API_KEY` | Code marchand Djomy — header **`X-PARTNER-DOMAIN`** sur **toutes** les requêtes (prod) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Fulfillment PASS |
| `DJOMY_RETURN_URL` / `DJOMY_CANCEL_URL` | Retour après paiement |
| `PASS_PRICE_*_GNF` | Fallback tarifs prod si `app_settings` vide |
| `PAYMENT_SANDBOX_AMOUNTS` | Force montants sandbox (sinon auto si URL Djomy sandbox) |

### Source de vérité tarifs / file

| Donnée | Clé `app_settings` | Admin mobile | Serveur |
|--------|--------------------|--------------|---------|
| Prix PASS | `pass_prices_v1_GN` (etc.) | Gestion PASS → prix | `resolveChargedPassPrice` (prod) |
| File max | `pass_shop_settings_v1_GN` | Gestion PASS → file | `resolveMaxPendingPasses` |

En sandbox Djomy, le serveur facture les montants sandbox (ex. 1 000 GNF), pas les prix catalogue affichés.

## Mobile

Dans `mobile/.env` :

```
EXPO_PUBLIC_PAYMENT_API_URL=http://VOTRE_IP_LAN:8787
```

Sur téléphone physique, utilisez l'IP locale du PC (pas `localhost`).

Dans l’app : **Super admin → Paramètres → Achat PASS = Visible** (gate remote, défaut Masqué).

## Checklist sandbox bout-en-bout

1. Migration `20260827_djomy_payments.sql` appliquée
2. `server/.env` sandbox + service role OK ; serveur démarré
3. Tunnel HTTPS → webhook `…/api/webhook/djomy` (ou compter sur le polling)
4. Mobile : `EXPO_PUBLIC_PAYMENT_API_URL` pointe vers le serveur
5. Gate **Achat PASS** ON (super admin)
6. Compte membre free → Prime → Paiement → numéro test Djomy → OTP
7. Attendre fulfillment → rôle Prime + entrée dans Mon PASS
8. Remettre **Achat PASS** OFF après le test si besoin

### Portail Djomy sandbox qui échoue (0 GNF dashboard)

**Confirmé par Djomy :** Orange Money — *tous les paiements échouent en sandbox*.  
Tester avec leurs comptes officiels :

| Moyen | Compte test | Code |
|-------|-------------|------|
| **PayCard** | `537417414` | OTP `0000` |
| **Soutra** | `622356781` | PIN `1111` |
| **Carte (succès)** | `2303779999000275` | exp. future + CVV 3 chiffres |
| Orange Money | — | **Ne pas tester en sandbox** |

Règle : **même identifiant payeur dans l’app et sur Djomy** (le champ préremplit le portail).  
Soutra/PayCard : envoyer le compte **sans** préfixe `00224`.

Montants Soutra / PayCard : **≤ 10 000 GNF** (déjà le cas avec nos tarifs sandbox).

Workaround interne uniquement si besoin produit : `POST /api/payments/:id/sandbox-complete` / bouton simulateur (`PAYMENT_SANDBOX_AMOUNTS=1`).

## Webhook Djomy (tunnel HTTPS)

Djomy **n'appelle votre webhook qu'en HTTPS**. En local (`http://192.168.x.x:8787`), le paiement peut réussir sur le portail, mais **l'activation automatique du PASS** dépend du webhook ou du polling app.

### Qu'est-ce que le « tunnel » ?

Un **tunnel** (ngrok, Cloudflare Tunnel) expose votre serveur local sur une URL publique HTTPS, par ex. :

```
https://abc123.ngrok-free.app  →  votre PC port 8787
```

### Configuration

1. Lancer le serveur paiement (`npm run payment-server` à la racine, ou `npm run dev` dans `server/`)
2. Lancer ngrok : `ngrok http 8787`
3. Copier l'URL HTTPS affichée (ex. `https://abc123.ngrok-free.app`)
4. Dashboard Djomy → Webhook URL :

```
https://abc123.ngrok-free.app/api/webhook/djomy
```

5. Sans tunnel HTTPS, l'app **interroge Djomy automatiquement** à chaque poll (`GET /api/payments/:id/status`) pour activer le PASS dès confirmation.

### Prod HTTPS (post-décembre)

- Déployer le serveur paiement derrière HTTPS (Railway, Fly, VPS + reverse proxy)
- Webhook Djomy = `https://VOTRE_DOMAINE/api/webhook/djomy`
- Couper `PAYMENT_SANDBOX_AMOUNTS` / pointer `DJOMY_BASE_URL` prod
- Vérifier tarifs admin synchro dans `pass_prices_v1_*`
- Activer le toggle **Achat PASS** uniquement quand prêt

## Modes de paiement (API gateway)

Méthodes Djomy via `create_payment_gateway` :

| Code Djomy | Libellé app |
|------------|-------------|
| OM | Orange Money |
| MOMO | MTN MoMo |
| SOUTRA_MONEY | Soutra Money |
| PAYCARD | PayCard |
| CARD | Carte bancaire |

Choix **« Tous (portail Djomy) »** : n'envoie pas de filtre — Djomy affiche tout ce qu'active votre compte marchand (Kulu, YMO, etc. si activés côté Djomy).

Le serveur vérifie `X-Webhook-Signature: v1:<hex>` puis appelle `verify_payment` avant d'activer le PASS.

## Migration Supabase

Appliquer `supabase/migrations/20260827_djomy_payments.sql` avant les tests réels.

## Déploiement production

Voir **[DEPLOY.md](./DEPLOY.md)** (`api.theloop-app.com`) et **[DJOMY_PRODUCTION.md](./DJOMY_PRODUCTION.md)**.

Mobile EAS : `EXPO_PUBLIC_PAYMENT_API_URL=https://api.theloop-app.com` (plus de ngrok en builds store).

## Routes

| Méthode | Route | Auth | Rôle |
|---------|-------|------|------|
| POST | `/api/create-payment` | Bearer JWT | Initie Djomy, renvoie `paymentUrl` |
| GET | `/api/payments/:id/status` | Bearer JWT | Polling après retour navigateur |
| GET | `/api/admin/payment-intents` | Admin JWT | Liste monitoring paiements PASS |
| POST | `/api/admin/payment-intents/:id/reconcile` | Admin JWT | Resync verify Djomy |
| POST | `/api/admin/users-activity` | Admin JWT | `last_sign_in_at` Auth (IDs page) |
| POST | `/api/webhook/djomy` | Signature HMAC | Active PASS en base |
| GET | `/payment/success` · `/payment/cancel` | — | Retour portail Djomy |
| GET | `/health` | — | Santé |
| POST | `/api/internal/cron` | `CRON_SECRET` (header `X-Cron-Secret` ou Bearer) | Push planifiés dus |

## Cron push planifiés

Les campagnes `admin_push_campaigns` en statut `scheduled` sont traitées par le serveur lorsque leur `scheduled_at` est dépassé — **sans** ouvrir l’app admin mobile.

1. Définir `CRON_SECRET` sur Render (long aléatoire).
2. Appliquer `supabase/migrations/20260915_cron_service_role_rpc.sql`.
3. Planifier un job HTTP (Render Cron, cron-job.org, etc.) :

```http
POST https://api.theloop-app.com/api/internal/cron

### Push OS unifié

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/admin/push/deliver` | Push Expo après inbox (mobile + admin-web + cron) |
X-Cron-Secret: <CRON_SECRET>
```

Fréquence recommandée : **toutes les 5 minutes**. Réponse JSON : `{ ok, push: { pushCampaignsSent, pushRecipients, errors } }`.

> **Note :** ouvrir l’URL dans un navigateur renvoie `Route introuvable` — le navigateur fait un **GET**, la route n’accepte que **POST**.

### Planificateur interne (défaut en prod)

Si `CRON_SECRET` est défini en production, le serveur lance **automatiquement** un timer toutes les 5 minutes (`internalPushCron: true` dans `/health`). **Aucun cron HTTP externe requis.**

- Désactiver : `DISABLE_INTERNAL_PUSH_CRON=1`
- Intervalle : `PUSH_CRON_INTERVAL_MINUTES=5` (défaut)

Le runner mobile (`admin-background-runner`) reste utile pour les automatisations locales ; le cron serveur couvre surtout les push planifiés Supabase.
