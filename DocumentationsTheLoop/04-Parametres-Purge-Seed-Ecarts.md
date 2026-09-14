# 04 — Paramètres, purge, seed et écarts (drift)

## 1. Trois mécanismes distincts (ne pas confondre)

| Mécanisme | Fichier | Effet | Quand l’utiliser |
|-----------|---------|-------|------------------|
| **Migrations** | `supabase/migrations/*.sql` | Évolution **schéma** + seeds idempotents `ON CONFLICT DO NOTHING` | Déploiement prod, CI Supabase |
| **Purge sandbox** | `purge_all_except_super_admin.sql` | Vide **données opérationnelles**, garde paramètres + super_admin + Guinée | Reset sandbox test |
| **Seed defaults** | `seed_platform_defaults.sql` | **Écrase** paramètres canoniques (DELETE + INSERT) | Après purge si reset complet paramètres |

**Erreur fréquente :** croire que la purge remet les catégories / PASS / sections UI à la « dernière version admin ».  
**Non** — la purge conserve ce qui est en base **au moment T** (tables preserve) ou le seed **canonique fixe** si vous relancez le seed.

---

## 2. Purge — comportement exact

**Script :** `supabase/scripts/purge_all_except_super_admin.sql`

### Étape 1 — Détacher FK users supprimés
Met à NULL / réassigne `master_id`, `organizer_id`, `drawn_by`, etc. sur les tables encore présentes avant TRUNCATE.

### Étape 2 — TRUNCATE dynamique
Boucle sur **toutes** les tables `public.*` sauf :

```
guinea_locations
app_settings
app_legal_content
content_categories
platform_roles
referral_settings
spot_star_settings
spot_star_tiers
partner_milestone_rules
admin_automation_jobs
users  (traité à part)
```

### Étape 3 — Users
- `DELETE FROM public.users` sauf super_admin
- Nettoyage `auth.*` (refresh_tokens en VARCHAR → cast texte)
- `DELETE FROM auth.users` sauf super_admin

### Ce que la purge **ne fait pas**

- Ne touche **pas** AsyncStorage sur le téléphone
- Ne resynchronise **pas** `event_categories` / `establishment_categories` depuis `content_categories`
- Ne met **pas** à jour le seed avec vos modifs admin passées

---

## 3. Seed — comportement exact

**Script :** `supabase/scripts/seed_platform_defaults.sql`

Exécuté **après** purge, il :

| Section | Action | Tables |
|---------|--------|--------|
| 1 | `DELETE` + INSERT | `app_settings` (11 clés) |
| 2 | `DELETE` + INSERT | `app_legal_content` (3 clés) |
| 3 | `DELETE` + INSERT | `content_categories` (14 lignes) |
| 4 | `DELETE` + INSERT | `referral_settings` |
| 5 | DELETE calc + tiers + INSERT | `spot_star_settings`, `spot_star_tiers` |
| 6 | DELETE rules + INSERT | `partner_milestone_rules` |
| 7 | DELETE + INSERT | `admin_automation_jobs` (4 jobs) |
| 8 | DELETE + INSERT | `platform_roles` (5 rôles) |
| 9 | DELETE | `staff_benefit_overrides`, `admin_permission_overrides` |

**Volontairement laissé vide après seed :**  
`benefit_catalog`, `events`, `establishments`, `tools`, tous octrois, users (hors super_admin déjà en place).

---

## 4. Problème catégories : seed ≠ vos modifications admin

### 4.1 Contenu seed actuel (14 catégories intégrées)

**Événements :** corporate, nightlife, art_culture, gastronomie  
**Spots :** fine_dining, hotels, bars_lounges  
**Outils :** tool-productivite, tool-finance, tool-commerce, tool-social, tool-sante, tool-education, tool-autre  

C’est **identique** à la migration `20260749_remote_app_config.sql`.

### 4.2 Si vous aviez modifié les catégories en admin

Exemples de changements **non** reflétés automatiquement :

- Renommer « Nightlife » → « Soirées »
- Ajouter une catégorie custom « Sport »
- Désactiver « Gastronomie »
- Changer emoji ou ordre

**Scénarios :**

| Action | Résultat catégories |
|--------|---------------------|
| Purge **seule** | **Conservées** telles qu’en base avant purge |
| Purge + **seed** | **Réinitialisées** aux 14 lignes canoniques — **perte** des custom |
| Purge sans seed + cache mobile | Admin mobile peut encore montrer cache `loop_admin_categories_v3` |

### 4.3 Tables miroir legacy

`event_categories` et `establishment_categories` (INT id) sont **vidées** par purge.  
Si vous ne relancez pas les fonctions de sync (`20260754`, `20260756`), des **FK orphelines** ou résolveurs peuvent se comporter bizarrement jusqu’à republication contenu.

**Recommandation :** après purge + seed catégories, exécuter ou vérifier sync admin catégories depuis l’app (écran Catégories) ou scripts migration sync.

---

## 5. Problème clics inexplicables post-purge

### 5.1 En base Supabase

Après purge : `establishments` = **0 lignes** → `click_count` n’existe plus en base.

### 5.2 Sur le téléphone (cause principale)

| Clé AsyncStorage | Fichier store | Effet |
|------------------|---------------|-------|
| `loop_spot_engagement_v1` | `spot-stars-store.ts` | Map spotId → clicks, favoris, score |
| `loop_local_favorite_counts_v1` | `admin-insights-store.ts`, `spot-stars-store.ts` | Compteurs favoris agrégés locaux |
| `loop_content_snapshot_v1` | `content-store.ts` | Snapshot complet events/spots/outils |

**Insights admin** (`getFullAdminInsights`) :

1. Charge le catalogue live (ou cache snapshot).
2. **Additionne** favoris locaux par user du registre (avant sync Supabase).
3. Lit clics depuis engagement local **et** colonnes Supabase si spots existent.

→ Après purge, des **IDs de spots supprimés** peuvent encore avoir des clics en cache → **clics fantômes** dans Insights / Étoiles.

### 5.3 Correction immédiate (opérateur)

1. Fermer complètement l’app mobile.
2. Rouvrir + pull-to-refresh sur Insights.
3. Si persiste : réinstaller l’app OU appeler `clearOperationalDeviceCache()` (`mobile/src/lib/device-operational-cache.ts`).

### 5.4 Correction durable (développement)

- Purger engagement local quand Supabase renvoie catalogue vide
- Ne pas agréger `loop_local_favorite_counts_v1` si `establishments` count = 0
- Invalider `loop_content_snapshot_v1` après purge (déjà partiellement via `invalidateContentCache`)

---

## 6. Écarts seed vs migrations (liste complète)

| Élément | Migration seule | Seed sandbox |
|---------|-----------------|--------------|
| `role_benefit_entitlements.admin` | Absent | `[]` présent |
| `app_sections_ui` | Absent | Présent |
| `pass_catalog_v1` | Absent | Heritage + Intermediaire |
| `pass_activation_messages_v1` | Absent | 3 templates |
| `pass_shop_settings_v1` | Absent | maxPendingPasses=3 |
| `benefit_types` | Absent | 3 types builtin |
| `mentions_legales` | Migration 20260735 : cgu + partner_terms seulement | 3 clés légales |
| `partner_milestone_rules` | Migration : 50 membres + 100 validations | Seed : **20 + 50 validations** |
| `benefit_catalog` démo | 2 avantages L'Avenue / Sky Lounge | **Vide** |
| `platform_roles` | Incluait tool_partner (20260751) | 5 rôles sans tool_partner (20260758 merge) |

**Conséquence :** une base créée **uniquement** par migrations cumulées ≠ une base **purge + seed** sur paliers partenaires, catalogue avantages, etc.

---

## 7. Ordre opératoire recommandé (sandbox propre)

```
1. promote_super_admin.sql          (adapter e-mail)
2. purge_all_except_super_admin.sql
3. seed_platform_defaults.sql       (si reset paramètres canoniques voulu)
4. Vérifier requêtes audit (doc 03 section O)
5. Sur téléphone : kill app + refresh admin
6. (Optionnel) seed_guinea_locations.sql si table vide
```

---

## 8. Quand **ne pas** lancer le seed

- Vous voulez garder les **catégories modifiées** en admin → purge seule OK, **pas** seed section 3
- Vous voulez garder **PASS catalog custom** dans app_settings → pas seed section 1
- Vous voulez garder **mentions légales** personnalisées → pas seed section 2

Le seed est un **reset canonique**, pas une merge.

---

## 9. Matrice « paramètre ou opérationnel » — résumé une page

| Paramètre (conservé purge) | Opérationnel (vidé purge) |
|----------------------------|---------------------------|
| app_settings | events, establishments, tools |
| app_legal_content | partner_*_submissions |
| content_categories* | benefit_catalog, prime_benefit_grants |
| platform_roles | user_pass_grants, payment_intents |
| referral_settings | user_notifications |
| spot_star_settings/tiers | favorite_*, ratings |
| partner_milestone_rules | partner_milestone_rewards |
| admin_automation_jobs | admin_benefit_draws, benefit_redemptions |
| guinea_locations | home_polls, loop_walks, referrals |

\* `content_categories` conservée mais écrasée si seed section 3 exécutée.

---

## 10. Prochaine étape recommandée (produit)

1. **Exporter** les paramètres prod actuels (`SELECT key, value FROM app_settings`) avant purge.
2. **Fusionner** dans `seed_platform_defaults.sql` les valeurs réelles (catégories, PASS, sections UI).
3. **Script sync post-purge mobile** : bouton admin « Vider cache appareil » appelant `clearOperationalDeviceCache()`.
4. **Aligner seed** `partner_milestone_rules` sur la version métier validée.
