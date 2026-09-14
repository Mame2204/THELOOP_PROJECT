# Console admin web THE LOOP

Front Vite + React pour `admin.theloop-app.com`.  
Réutilise Supabase Auth + l’API `https://api.theloop-app.com` (JWT admin).

## Socle (étape 0)

- Shell sidebar alignée mobile (modules + permissions)
- Filtre pays admin
- Routes : Paiements, Users, PASS (+ placeholders des autres modules)

## Dev local

```powershell
cd admin-web
..\.tools\node\npm.cmd install
# .env : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL=http://localhost:8787
# ou VITE_API_URL=https://api.theloop-app.com
..\.tools\node\npm.cmd run dev
```

## Prod

1. Build : `npm run build` → `dist/`
2. Héberger (Netlify / Cloudflare Pages / Render Static)
3. DNS CNAME `admin` → hébergeur
4. Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://api.theloop-app.com`

Accès : comptes `admin` / `super_admin` actifs. Permissions via RPC `get_my_admin_permissions`.
