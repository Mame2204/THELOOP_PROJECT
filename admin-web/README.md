# Console admin web THE LOOP

Front Vite + React pour `admin.theloop-app.com`.  
Supabase Auth + API `https://api.theloop-app.com`.

## Modules livrés

| Route | Module |
|-------|--------|
| `/payments` | Paiements Djomy |
| `/users` | Users, waitlist, invitations |
| `/pass` | Catalogue PASS, prix, messages |
| `/demandes` | Partenariats, modération, idées |
| `/contenu` | Catalogue events/spots/outils |
| `/accueil` | Blocs Accueil, À la une, éditoriaux |
| `/loop` | Hub publication équipe |
| `/privileges` | Validations, catalogue, octrois |
| `/insights` | KPIs engagement |
| `/parametres` | Gates, pays, catégories, droits, légal |

Encore stubs : Onglets, TEAMS, Tirage.

## Dev local

```powershell
cd admin-web
npm ci
# .env : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm run dev
```

## Prod

Voir [DEPLOY.md](./DEPLOY.md) — Netlify ou Cloudflare Pages + CNAME `admin`.
