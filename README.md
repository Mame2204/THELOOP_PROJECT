# THE LOOP — Conakry

Progressive Web App mobile-first : agenda, guide VIP et networking d'affaires pour Conakry (Guinée).

## Stack

- **React 19** + **TypeScript** + **Vite 6**
- **Tailwind CSS 4**
- **React Router 7** (routage par rôles)
- **Supabase** (PostgreSQL + Auth + Realtime)
- **vite-plugin-pwa** (installable sur mobile)

## Démarrage

```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

> **Note :** L'app fonctionne en mode démo sans Supabase (données mockées dans `src/lib/demo-data.ts`).

## Architecture

```
src/
├── components/
│   ├── public/       # Agenda, guide VIP
│   ├── blackloop/    # Répertoire, chat
│   ├── partners/     # (pages dans pages/partners)
│   ├── admin/        # (pages dans pages/admin)
│   └── shared/       # AuthModal, FavoriteButton, HeroSlider
├── context/          # AuthContext, FavoritesContext
├── hooks/            # useAuth, useFavorites
├── layouts/          # MainLayout, BottomNav
├── lib/              # supabase client, demo-data
├── pages/            # Écrans par espace
├── routes/           # Router + ProtectedRoute
└── types/            # Interfaces TypeScript globales
```

## Espaces & rôles

| Espace | Route | Acteur / rôle |
|--------|-------|---------------|
| Public | `/`, `/agenda`, `/guide` | Visiteur (lecture) · Membre · Black Loop · Admin |
| Favoris | `/favoris` | Membre · Black Loop · Admin |
| Black Loop | `/black-loop/*` | Black Loop · Admin |
| Partenaires | `/partenaires` | Partenaire (jeton SPOT) |
| Admin | `/admin/*` | Admin |

## Base de données

Exécuter `supabase/schema.sql` dans l'éditeur SQL Supabase. Le script inclut :

- Tables : profiles, events, locations, hero_banners, partner_tokens, handshake_requests, messages, favoris…
- RLS sur `user_favorite_events` et `user_favorite_locations`
- Trigger auto-création profil à l'inscription

## Démo locale

- Jeton partenaire : `SPOT-DEMO-2026`
- Like/Sauvegarder sans compte → pop-up d'engagement
- Compte gratuit → favoris débloqués
