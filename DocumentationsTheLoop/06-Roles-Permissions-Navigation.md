# 06 — Rôles, permissions et navigation

## 1. Rôles applicatifs (`mobile/src/types/index.ts`)

| UserRole | Label FR | Hiérarchie | DB `user_role` |
|----------|----------|------------|----------------|
| `USER_ANONYMOUS` | Sans compte | 0 | (non connecté — écran Auth) |
| `USER_FREE` | Membre gratuit | 1 | `member` |
| `USER_PRIME` | Loop Prime | 2 | `prime` |
| `PARTNER` | Partenaire Pro | 2 | `partner`, `tool_partner` |
| `ADMIN` | Administrateur | 3 | `admin`, `super_admin` |

### Helpers permissions

```typescript
hasMinimumRole(userRole, requiredRole)  // comparaison hiérarchie
canInteract(role)                       // !== USER_ANONYMOUS
canSaveFavorites(role)                  // authentifié
canViewPrimeContent(role)               // USER_PRIME + ADMIN + PARTNER (+ prime actif)
isPrimeMember(role)                     // USER_PRIME strict (thème indigo)
isAuthenticated(role)                   // !== USER_ANONYMOUS
```

---

## 2. Super admin vs admin délégué

| | Super admin | Admin délégué |
|--|-------------|---------------|
| DB | `user_role = super_admin` | `user_role = admin` |
| Permissions | **Tous** modules | Sous-ensemble + overrides |
| PASS management | ✓ | ✗ |
| Gestion admins / paramètres globaux | ✓ | ✗ |
| Thème | `ADMIN` (bordeaux) | `DELEGATED_ADMIN` (gris bleu) |

**Permissions par défaut** (`app_settings.admin_default_permissions`) :  
`moderation`, `content`, `insights`

**Overrides :** table `admin_permission_overrides` (grant / revoke par permission).

---

## 3. Catalogue permissions admin

| ID permission | Module | Route mobile |
|---------------|--------|--------------|
| `content_countries` | Pays du contenu | AdminContentCountries |
| `content` | Contenu publié | AdminContent |
| `categories` | Catégories | AdminCategories |
| `spot_stars` | Étoiles spots | AdminSpotStars |
| `featured` | Accueil éditorial | AdminFeatured / AdminAccueil |
| `insights` | Insights | AdminInsights |
| `users` | Utilisateurs | AdminUsers |
| `partnerships` | Partenariats | AdminPartnerships |
| `partner_milestone` | Paliers partenaires | AdminPartnerMilestones |
| `suggestions` | Suggestions | AdminSuggestions |
| `automation` | Automatisations | AdminAutomationJobs |
| `legal` | CGU & légal | AdminLegal |
| `prime_benefits` | Avantages | AdminPrimeBenefits |
| `benefit_draw` | Tirage au sort | AdminBenefitDraw |
| `notifications` | Notifications | AdminNotifications |
| `moderation` | Modération | AdminModeration |
| `pass_management` | Gestion PASS | AdminPassManagement (**super admin**) |
| `manage_admins` | Permissions admins | AdminPermissions (**super admin**) |

**RPC :** `get_my_admin_permissions`, `set_admin_permission_overrides`, etc.

---

## 4. Navigation mobile — barre basse (`CustomTabBar.tsx`)

| Onglet | Rôles | Condition extra |
|--------|-------|-----------------|
| Accueil | FREE, PRIME, PARTNER, ADMIN | — |
| Agenda | FREE, PRIME, PARTNER, ADMIN | `app_sections.agenda.tabVisible` |
| Spots | FREE, PRIME, PARTNER, ADMIN | `app_sections.spots.tabVisible` |
| Outils | FREE, PRIME, PARTNER, ADMIN | `app_sections.outils.tabVisible` |
| Favoris | FREE, PRIME, PARTNER, ADMIN | — |
| Pro | PARTNER | `app_sections.partnerPro.spaceVisible` |
| Admin | ADMIN | — |
| Profil | FREE, PRIME, PARTNER, ADMIN | — |

> **Sans compte :** pas d’onglets — pile **Auth** uniquement (`RootNavigator`, `!appUnlocked`).

**Stats partenaire :** écran `PartnerStatsScreen` — **pas** dans la barre, accès depuis Espace Pro.

**Rafraîchissement sections :** polling 15 s sur `getAppSections()` ← `app_settings.app_sections_ui`.

---

## 5. Différences vs PWA web (`.cursorrules`)

| Règle web | Mobile actuel |
|-----------|---------------|
| Favoris FREE : bottom nav only | ✓ Favoris en barre |
| Favoris PRIME/PARTNER : menu bonhomme only | **Écart :** Favoris aussi en barre pour PARTNER/ADMIN |
| Bottom nav BL : 4 items | N/A (pas de Black Loop tab mobile) |
| Répertoire / Abonnement bottom nav Prime | Accès via **Profil** stack |

---

## 6. Thèmes visuels (`theme-config.ts`)

| ThemeId | Public | Couleur accent |
|---------|--------|----------------|
| `VISITOR` | Auth (sans compte) | Teal `#12A8BC` |
| `FREE_MEMBER` | Membre | Teal foncé `#0D7A8C` |
| `PRIME_MEMBER` | Prime | Indigo `#1A237E` |
| `PARTNER` | Partenaire | Vert `#20C997` |
| `ADMIN` | Super admin | Bordeaux `#8E1631` |
| `DELEGATED_ADMIN` | Admin délégué | `#546E7A` |

Or marque : `#D4AF37` (`LOOP_GOLD`).

Shell admin : fond noir, sidebar `AdminSidebar`, accent or `#C9A84C`.

---

## 7. Mapping `platform_roles` (table PARAMÈTRE)

| slug | app_role | theme_id | is_admin |
|------|----------|----------|----------|
| member | USER_FREE | FREE_MEMBER | false |
| prime | USER_PRIME | PRIME_MEMBER | false |
| partner | PARTNER | PARTNER | false |
| admin | ADMIN | DELEGATED_ADMIN | true |
| super_admin | ADMIN | ADMIN | true |

Chargé au boot via `bootstrapPlatformRoles()` → cache `loop_platform_roles_v1`.

---

## 8. Session partenaire SPOT (hors matrice rôle Auth)

- Connexion : `signInWithPartnerToken()` lit `partner_tokens`.
- Session : `loop_partner_spot_session_v1`.
- L’utilisateur partenaire **n’a pas** nécessairement de ligne `auth.users` active dans la session courante.
- Déconnexion partenaire ≠ déconnexion membre (gérées séparément).

---

## 9. Filtre pays admin

- Contexte : `AdminCountryContext`
- Clé locale : `loop_admin_country_v1`
- Impact : insights, octrois avantages, liste contenu, tirages, stats — scope `country_code` (défaut GN).

---

## 10. Matrice accès contenu Prime

| Rôle | Contenu `visibility: public` | Contenu `visibility: prime` |
|------|------------------------------|-----------------------------|
| Sans compte | ✗ (pas d’accès app) | ✗ |
| Membre free | ✓ | ✗ |
| Prime | ✓ | ✓ |
| Partenaire | ✓ | ✓ (modération) |
| Admin | ✓ | ✓ |

Filtres pill « LoopX » / « Loop Prime » : visibles **USER_PRIME** uniquement (web rules ; mobile aligné sur `canViewPrimeContent`).

---

## 11. Écrans admin — arborescence workspace

```
AdminTower (tab)
└── AdminWorkspaceScreen (split)
    ├── AdminInsightsScreen
    ├── AdminAccueilScreen
    ├── AdminRubriqueScreen
    ├── AdminLoopScreen → AdminLoopContentScreen
    ├── AdminContentScreen
    ├── AdminSpotStarsScreen
    ├── AdminUsersScreen
    ├── AdminDemandesScreen (modération + partenariats + suggestions)
    ├── AdminPrimeBenefitsScreen
    ├── AdminStaffBenefitsScreen (TEAMS)
    ├── AdminBenefitDrawScreen
    ├── AdminPassManagementScreen (super admin)
    └── AdminSuperSettingsScreen (super admin)
            ├── AdminCategoriesScreen
            ├── AdminLegalScreen
            ├── AdminPermissionsScreen
            ├── AdminContentCountriesScreen
            ├── AdminOpeningHoursScreen
            ├── AdminAutomationJobsScreen
            └── …
```

Garde d’accès : `useAdminModuleAccess(permission)` + écran `AdminModuleDenied`.

---

## 12. Comptes démo (PWA — référence)

| Persona | E-mail | Jetons |
|---------|--------|--------|
| Admin | admin@theloop.gn | — |
| Prime | prime@theloop.gn | — |
| Membre | membre@theloop.gn | — |
| Partenaire | contact@lavenue.gn | SPOT-DEMO-2026 |
| VIP | — | INVIT-DEMO-2026 |

**Sandbox Supabase actuelle :** compte super_admin **personnalisé** (promote_super_admin.sql) — les comptes démo ne existent plus après purge sauf recréation manuelle.
