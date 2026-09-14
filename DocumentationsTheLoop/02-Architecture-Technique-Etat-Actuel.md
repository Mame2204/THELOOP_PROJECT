# 02 — Architecture technique (état actuel)

## 1. Stack

| Couche | Technologie |
|--------|-------------|
| Mobile | React Native, Expo SDK, TypeScript 5.x |
| Navigation | `@react-navigation/native-stack` + bottom tabs |
| Web PWA | React 19, Vite 6, Tailwind CSS 4 (`src/`) |
| Backend | Supabase (PostgreSQL 15+, Auth, RLS, Edge Functions optionnelles) |
| Auth mobile | Supabase Auth + session partenaire SPOT parallèle |
| Paiement | Djomy API → `payment_intents` |
| Persistance locale | `@react-native-async-storage/async-storage` |
| Alias imports mobile | `@/` → `mobile/src/` |

---

## 2. Arborescence projet

```
THELOOP_PROJECT/
├── mobile/                    ← App Expo (référence actuelle)
│   ├── App.tsx
│   └── src/
│       ├── components/        UI (admin, cartes, tab bar…)
│       ├── context/           Providers React (auth, favoris, pays…)
│       ├── hooks/
│       ├── lib/               ~150 stores / sync / mappers
│       ├── navigation/
│       ├── screens/           66 écrans
│       └── types/
├── src/                       ← PWA web legacy
├── supabase/
│   ├── migrations/            99 migrations (20260711 → 20260831)
│   ├── schema.sql             Schéma legacy (≠ prod V1.0 seule)
│   └── scripts/               purge, seed, promote_super_admin…
├── DocumentationsTheLoop/     ← Ce dossier
└── .cursorrules               Règles architecture PWA web
```

---

## 3. Point d’entrée mobile et providers

**Fichier :** `mobile/App.tsx`

Ordre des providers (simplifié) :

```
SafeAreaProvider
  AuthProvider
    AdminPermissionsProvider
      ThemeProvider
        ContentCountriesProvider
          AdminCountryProvider
            CategoryLabelsProvider
              ViewingCountryProvider
                NotificationsProvider
                  ContentProvider
                    FavoritesProvider
                      …
                        RootNavigator
```

**Conséquence :** tout écran consomme auth, pays, catalogue via contextes ; les stores `lib/` gèrent persistance fine.

---

## 4. Modèle de données : trois couches

```
┌─────────────────────────────────────────────────────────┐
│  UI (screens + components)                              │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  Stores lib/ (cache + logique métier)                   │
│  • AsyncStorage (offline, démo, fantômes possibles)     │
│  • merge local + remote                                  │
└─────────────┬───────────────────────┬───────────────────┘
              │                       │
┌─────────────▼──────────┐  ┌─────────▼─────────────────┐
│  Supabase PostgreSQL    │  │  Supabase Auth           │
│  public.* + RPC         │  │  auth.users              │
└─────────────────────────┘  └──────────────────────────┘
```

### Règle générale (état actuel)

- **Écriture :** souvent local d’abord, puis sync Supabase (si online + configuré).
- **Lecture admin octrois / tirages / PASS :** corrigée pour privilégier Supabase quand disponible (août 2026).
- **Lecture insights clics :** mélange Supabase (`establishments.click_count`) + **cache local** (`loop_spot_engagement_v1`, `loop_local_favorite_counts_v1`) → risque post-purge.

---

## 5. Schéma Supabase : deux héritages

### 5.1 Production V1.0 (utilisé par l’app mobile)

Tables centrales **non recréées** dans les migrations récentes mais **étendues** :

- `users`, `events`, `establishments`, `tools`
- `favorite_events`, `favorite_spots`, `favorite_tools`
- `partner_event_submissions`, `partner_spot_submissions`
- `event_categories`, `establishment_categories` (miroir legacy des slugs)

### 5.2 `schema.sql` (legacy)

- Modèle `profiles` + enum PostgreSQL `user_role`
- `locations` UUID, messagerie handshake, `user_favorite_*`
- **Ne pas réappliquer** sur une base déjà migrée sans audit complet.

### 5.3 Source de vérité moderne catégories

**`content_categories`** (kind: event | spot | tool)  
→ synchronisée vers `event_categories` / `establishment_categories` via migrations `20260754`, `20260756`, `20260760`.

---

## 6. Authentification mobile

### 6.1 Membre / admin (Supabase Auth)

1. `signUp` / `signIn` → JWT persisté (AsyncStorage via client Supabase).
2. Ligne `public.users` créée (trigger ou RPC `ensure_user_profile`).
3. `finalizeUserSession` : registre local, parrainage, entitlements rôle, polls.

### 6.2 Partenaire (session SPOT)

1. Lecture `partner_tokens` (token actif, non expiré).
2. Session stockée dans `loop_partner_spot_session_v1`.
3. **Pas** de JWT membre standard — déconnexion membre si conflit.

### 6.3 Contrôle lifecycle

- `users.account_status` : `active`, `suspended`, `archived`, `deleted`
- `users.is_active`, `users.prime_role_locked` (gel rétrograde Prime)

---

## 7. RPC Supabase importantes

| RPC | Rôle |
|-----|------|
| `ensure_user_profile` | Profil post-inscription |
| `upsert_partner_event_submission` / `publish_partner_event_submission` | Workflow événement |
| `upsert_partner_spot_submission` / `publish_partner_spot_submission` | Workflow spot/outil |
| `admin_withdraw_partner_content` | Rétraction publication (20260831) |
| `admin_upsert_benefit_catalog` | Catalogue avantages |
| `upsert_prime_benefit_grant` | Octroi membre |
| `bulk_update_user_pass_grants` | Admin PASS |
| `increment_spot_click` | Compteur clic spot |
| `recalculate_*_engagement` | Étoiles / scores |
| `admin_set_app_setting` | Upsert `app_settings` (bypass RLS client) |
| `insert_user_notifications` | Notifications batch |
| `verify_member_qr_payload` | Validation QR rotatif |

Liste complète : grep `CREATE OR REPLACE FUNCTION` dans `supabase/migrations/`.

---

## 8. Migrations récentes notables (202608xx)

| Migration | Sujet |
|-----------|-------|
| `20260815`–`20260827` | PASS grants, pending, frozen snapshot, Djomy payments |
| `20260825` | `prime_role_locked` |
| `20260828` | `account_status` lifecycle |
| `20260829` | Galerie images événements |
| `20260830`–`20260831` | Retrait contenu partenaire + fix comptes |

---

## 9. Variables d’environnement mobile

| Variable | Usage |
|----------|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | URL projet Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé anon |
| Clés Djomy | Paiement PASS (voir `pass-purchase-store.ts`) |

Sans URL + anon key → `isSupabaseConfigured() === false` → mode démo local.

---

## 10. Commandes développement

**PWA web** (`.cursorrules`) :

```powershell
.\.tools\node\npm.cmd install
.\.tools\node\npm.cmd run dev      # port 5173
.\.tools\node\npm.cmd run build
.\.tools\node\npm.cmd run lint
```

**Mobile :** voir `mobile/package.json` et scripts type `mobile-token-login.cmd`.

---

## 11. Dette technique connue (documentée)

| Sujet | Détail |
|-------|--------|
| Double schéma | `schema.sql` vs Production V1.0 |
| Cache local | Fantômes post-purge si pas refresh / clear cache |
| Seed vs admin live | Catégories / paramètres modifiés en prod pas rejoués dans seed d’origine |
| `referrals` / `referral_rewards` | RLS ON sans policy client → accès via RPC/service |
| `partner_benefit_offers` | Table fantôme référencée puis absente — utiliser `benefit_catalog` |
| Insights clics | Agrégation local + cloud → clics sur IDs supprimés possibles |
| PWA web | Parité partielle avec mobile |

---

## 12. Fichiers à lire avant toute modification

| Fichier | Pourquoi |
|---------|----------|
| `mobile/src/types/index.ts` | Rôles, permissions helpers |
| `mobile/src/context/AuthContext.tsx` | Auth, session |
| `mobile/src/lib/content-store.ts` | Catalogue public |
| `mobile/src/lib/partner-staging-store.ts` | Staging partenaire |
| `mobile/src/lib/benefit-catalog-store.ts` | Catalogue avantages |
| `mobile/src/lib/prime-benefits-store.ts` | Octrois |
| `mobile/src/lib/admin-insights-store.ts` | Insights (clics, favoris) |
| `supabase/scripts/purge_all_except_super_admin.sql` | Sandbox reset |
| `supabase/scripts/seed_platform_defaults.sql` | Paramètres canoniques |
