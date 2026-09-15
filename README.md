# THE LOOP — Monorepo

Application **mobile native** (Expo), **console admin web** et **serveur paiement** pour Conakry (Guinée).

> **PWA legacy (`src/`)** : gelée, non déployée, non maintenue. Code conservé pour référence.  
> Lancement local uniquement : `npm run dev:pwa-legacy` (nécessite les deps Vite du `package.json` racine).

## Packages actifs

| Dossier | Rôle | Démarrage |
|---------|------|-----------|
| `mobile/` | App membre + admin ops (source de vérité) | `npm run mobile` |
| `admin-web/` | Console admin bureau (`admin.theloop-app.com`) | `cd admin-web && npm run dev` |
| `server/` | API Djomy + cron push (`api.theloop-app.com`) | `npm run payment-server` |

## Scripts racine

```powershell
npm run mobile              # Expo dev
npm run payment-server      # Serveur paiement Node
npm run dev:pwa-legacy      # PWA legacy (dépréciée)
```

## Documentation

- `mobile/README.md` — build EAS, env, comptes test
- `admin-web/README.md` — deploy Netlify
- `server/README.md` — Djomy prod, webhook, cron
- `DocumentationsTheLoop/` — référentiel métier Supabase

## Supabase

Migrations dans `supabase/migrations/`. Backend prod : projet Supabase configuré dans `mobile/.env` et `admin-web/.env`.
