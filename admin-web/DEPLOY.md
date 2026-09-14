# Déploiement — admin.theloop-app.com

Front Vite : dossier `admin-web/` · build → `dist/` · SPA (fallback `index.html`).

## Variables build-time (obligatoires)

| Variable | Valeur |
|----------|--------|
| `VITE_SUPABASE_URL` | URL projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | clé anon / publishable |
| `VITE_API_URL` | `https://api.theloop-app.com` |

CORS API déjà prévu pour `https://admin.theloop-app.com` (`server/render.yaml`).

## Option A — Netlify (recommandé, `netlify.toml` prêt)

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → Import from Git → `Mame2204/THELOOP_PROJECT`
2. **Base directory** : `admin-web`
3. Build : `npm ci && npm run build` · Publish : `dist`
4. Site settings → Environment variables : les 3 `VITE_*` ci-dessus
5. Domain management → **Add domain** `admin.theloop-app.com`
6. DNS chez le registrar : **CNAME** `admin` → `xxx.netlify.app` (valeur affichée Netlify)

CI optionnelle : workflow `.github/workflows/deploy-admin-web.yml`  
Secrets GitHub : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.

## Option B — Cloudflare Pages

1. Workers & Pages → Create → Connect Git → même repo
2. Root directory : `admin-web` · Build : `npm ci && npm run build` · Output : `dist`
3. Variables `VITE_*` en build
4. Custom domain : `admin.theloop-app.com`

## Vérif post-déploiement

1. Ouvrir `https://admin.theloop-app.com/login`
2. Connexion compte `admin` / `super_admin`
3. Sidebar : Insights, Accueil, Contenu, Demandes, PASS, Paramètres…

## Accès local

```powershell
cd admin-web
npm ci
# .env avec les 3 VITE_*
npm run dev
```
