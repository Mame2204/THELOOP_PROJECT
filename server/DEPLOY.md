# Déploiement production — API THE LOOP (`api.theloop-app.com`)

Objectif : remplacer ngrok. Le serveur Node dans `server/` tourne 24/7 derrière HTTPS.

## 1. DNS (registrar de theloop-app.com)

| Type | Nom | Valeur |
|------|-----|--------|
| CNAME | `api` | hostname fourni par Render/Railway/Fly (ex. `theloop-api.onrender.com`) |
| CNAME | `admin` | hostname du front admin (phase E) — peut attendre |

Propagation : souvent 5–30 min. Vérifier : `nslookup api.theloop-app.com`

## 2. PaaS recommandé : Render (blueprint)

1. Compte [render.com](https://render.com) → New → Blueprint
2. Repo Git contenant `server/` **ou** dossier racine avec `server/render.yaml` adapté
3. Si monorepo : Root Directory = `server`
4. Renseigner les secrets (Dashboard → Environment) :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DJOMY_CLIENT_ID`
   - `DJOMY_CLIENT_SECRET`
5. Custom Domain : `api.theloop-app.com` (Render génère le certificat TLS)
6. Health : `https://api.theloop-app.com/health` → `ok: true`

Fichiers prêts : `Dockerfile`, `render.yaml`, `railway.json`, `Procfile`.

### Railway (alternative)

```bash
cd server
railway init
railway up
railway domain  # puis custom domain api.theloop-app.com
```

## 3. Variables prod (sandbox Djomy tant que KYC pas prêt)

```
NODE_ENV=production
PORT=8787
CORS_ORIGINS=https://admin.theloop-app.com,https://www.theloop-app.com,https://theloop-app.com
DJOMY_BASE_URL=https://sandbox-api.djomy.africa
PAYMENT_SANDBOX_AMOUNTS=1
DJOMY_RETURN_URL=https://api.theloop-app.com/payment/success
DJOMY_CANCEL_URL=https://api.theloop-app.com/payment/cancel
```

Webhook **Djomy sandbox** (dashboard développeur) :

```
https://api.theloop-app.com/api/webhook/djomy
```

## 4. Mobile EAS

Dans `mobile/eas.json` et `mobile/.env` :

```
EXPO_PUBLIC_PAYMENT_API_URL=https://api.theloop-app.com
```

Puis bump `buildNumber` / `versionCode` et `eas build`.

## 5. Checklist go-live API

- [ ] `GET /health` OK depuis Internet
- [ ] Webhook Djomy mis à jour (plus de ngrok)
- [ ] Create-payment depuis un build store → portail Djomy
- [ ] PayCard / Soutra / Carte sandbox → PASS activé
- [ ] PC éteint : l’API répond toujours

## 6. Basculer Djomy production (phase C)

Voir [DJOMY_PRODUCTION.md](./DJOMY_PRODUCTION.md).
