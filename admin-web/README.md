# Console admin web THE LOOP

Front Vite + React pour `admin.theloop-app.com`.  
Réutilise l’API `https://api.theloop-app.com` (JWT Supabase admin).

## Dev local

```powershell
cd admin-web
..\ .tools\node\npm.cmd install
# .env : VITE_SUPABASE_* + VITE_API_URL=http://localhost:8787
..\ .tools\node\npm.cmd run dev
```

## Prod

1. Build : `npm run build` → dossier `dist/`
2. Héberger (Render Static / Cloudflare Pages / Netlify)
3. DNS CNAME `admin` → hébergeur
4. Variables build : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://api.theloop-app.com`

Accès réservé aux comptes `admin` / `super_admin` actifs.
