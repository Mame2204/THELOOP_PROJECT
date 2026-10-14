# Audit base — validation stores & mise en prod

> Complète `12-Checklist-Validation-Store.md` (Partie D) et `11-Publication-Stores.md`.  
> **Script SQL :** `supabase/scripts/audit_store_prod_readiness.sql`

Objectif : parcourir **toute la base** une fois, décider **conserver / désactiver / supprimer**, figer les **gates** et les **2 comptes review**, sans casser PASS / paiements / compta.

---

## 1. Deux modes (ne pas confondre)

| Mode | Quand | Outil |
|------|--------|--------|
| **Review stores** | Avant envoi build 59 | Audit + **ménage léger** (contenu propre, comptes review, privilèges cohérents) |
| **Sandbox vide** | Environnement jetable | `purge_all_except_super_admin.sql` + `seed_platform_defaults.sql` (`reset_prod_sandbox.sql`) |

Pour la **prod review**, on **ne purge pas** l’historique PASS ni `payment_intents` (checklist D).

---

## 2. Ordre de l’exercice (2–3 h opérateur)

1. **Migrations** : dernière ligne inclut `20260966_benefit_catalog_template_flag.sql` (modèle vs déploiement).
2. Lancer **`audit_store_prod_readiness.sql`** section par section ; noter les lignes « À TRAITER ».
3. **Gates** (`app_settings`) : aligner review (§3).
4. **Comptes** : 1 super admin + membre review + Prime review (+ partenaire démo si besoin R1 couverture).
5. **Contenu** : ~2 events, 2 spots, 2 outils publiés, propres, GN.
6. **Privilèges** : déploiements actifs liés à ce contenu ; modèles `is_template` inactifs si doublon.
7. **PASS Prime review** : octroi actif sur compte Prime **sans** repasser par Djomy (V3).
8. **Légal** : `app_legal_content` complet (`20260957`).
9. **Paiement** : contrôle intégrité PASS (section 5 du script + `15-Lancement-Gates-Prod.md`).
10. **Téléphones** : après gros nettoyage SQL, vider cache app (Insights fantômes — `04-Parametres-Purge-Seed-Ecarts.md` §5).

---

## 3. Gates review (figer à l’envoi stores)

| Clé (`app_settings`) | Review | Prod décembre (exemple) |
|----------------------|--------|-------------------------|
| Inscription | **OFF** | OFF puis ON si ouverture |
| Achat PASS | **ON** | selon go-live |
| Privilèges visibles | **Visible** | Visible |
| Pré-lancement | **OFF** | ON si countdown |

Modifier via **super admin mobile → Paramètres** (pas obligatoirement SQL).

---

## 4. Tables par domaine — quoi garder / nettoyer

### A. Comptes & auth

| Table | Rôle | Review stores | Supprimer ? |
|-------|------|---------------|-------------|
| `auth.users` / `public.users` | Identité, rôle | **3 comptes** minimum (admin, membre review, Prime review) | Comptes test/demo **sans** octrois ni contenu |
| `admin_user_invites` | Invitations | Garder invites review si utilisées | Invites expirées / tests |
| `account_deletion_requests` | Suppression compte (V5) | 0 en attente ou 1 test traité | Anciennes demandes traitées (optionnel) |
| `user_push_tokens` | Push | Par compte review OK | Orphelins user supprimé |

**Ne pas supprimer** le super admin ni les comptes dont les mots de passe sont dans les notes Apple/Google.

---

### B. Contenu public

| Table | Rôle | Review | Nettoyage |
|-------|------|--------|-----------|
| `events` | Agenda | 2 publiés, images OK | Brouillons, doublons test, contenu offensif/incohérent |
| `establishments` | Guide spots | 2 publiés | Idem |
| `tools` | Outils | 2 publiés | Idem |
| `partner_*_submissions` | Staging | `approved` lié au publié | `pending`/`rejected` vieux tests |
| `content_categories` | Catégories | Seed ou admin cohérent | Purge+seed **seulement** si vous acceptez reset 14 catégories |

Privilèges **🎁 sur cartes** (V3/R3) : au moins une fiche publiée avec déploiement catalogue actif + gate Privilèges ON.

---

### C. Privilèges (détail)

| Table | Garder review | Supprimer / désactiver |
|-------|---------------|-------------------------|
| `benefit_catalog` | **Déploiements** actifs (`is_template=false`, avec lieu) | Modèles doublons (`is_template=true`) → `is_active=false` ; associations mortes |
| `partner_benefit_offers` | `accepted` liées aux déploiements gardés | `pending` sur catalogues abandonnés |
| `prime_benefit_grants` | Octrois **Prime review** + éventuels démos | Octrois sur `local_id` catalogue supprimé (après migration catalog_local_id) |
| `benefit_redemptions` | Historique si compta | Rarement DELETE (audit) |
| `scheduled_benefit_grants` | 0 ou campagnes futures réelles | Campagnes test |
| `admin_benefit_draws` | Historique audit | Optionnel |
| `app_settings` `role_benefit_entitlements_*` | Entrées pointant vers **local_id** déploiements actifs | Références à catalogues supprimés |

Voir aussi le guide conversation précédent (modèle vs déploiement).

---

### D. PASS & paiements

| Table | Review | Purger ? |
|-------|--------|----------|
| `user_pass_grants` | **Prime review** = PASS actif (admin) ; membre review = achat test Djomy annulé | **Non** (compta + démo review) |
| `payment_intents` | Tentatives Djomy review OK | **Non** |
| `pass_catalog` / prix (`app_settings`) | Cohérent GN | Ajuster admin, pas DELETE aveugle |

Membre review : **pas besoin** d’un PASS payé ; Prime review : **besoin** d’un PASS actif **sans** paiement relecteur.

---

### E. Partenaires

| Table | Review |
|-------|--------|
| `partner_tokens` | 1 jeton démo si test espace pro |
| `partner_staff` / `partner_validation_codes` | Alignés partenaires avec contenu publié |
| `partner_milestone_rewards` | Opérationnel — garder ou vider sandbox seulement |

---

### F. Paramètres & légal (toujours conserver en prod)

| Table | Action |
|-------|--------|
| `app_settings` | Gates + pricing ; **seed** ne pas relancer sans backup si custom admin |
| `app_legal_content` | Vérifier 5 clés (CGU, privacy, mentions, PASS, cookies) |
| `referral_settings`, `spot_star_*`, `partner_milestone_rules` | Paramètres — garder |
| `guinea_locations` | Référentiel — **ne jamais TRUNCATE** en prod |
| `content_categories` | Garder ; seed = reset |

---

### G. Engagement & bruit

| Table | Nettoyage review |
|-------|------------------|
| `user_notifications` | Optionnel : vieilles notifs test |
| `home_polls` / votes | 1 sondage propre ou vide |
| `favorites_*` | Faible impact ; purge sandbox seulement |
| `referrals` | Garder si test parrainage ; sinon laisser |

---

## 5. Cible minimale « base review propre »

| Élément | Cible |
|---------|--------|
| Users actifs métier | super_admin + membre review + Prime review (+ 1 partenaire optionnel) |
| Events / spots / tools publiés | **≥ 2 chacun** (checklist D) ou minimum 2+2+2 **total** affichable |
| `benefit_catalog` actifs (app) | Déploiements sans doublon titre ; modèles inactifs |
| PASS Prime review | 1 grant `active` |
| Gates | §3 |
| `payment_intents` / PASS membre | Conservés |
| Légal | Textes à jour |

---

## 6. Ce qu’il ne faut **pas** faire avant approbation stores

- `purge_all_except_super_admin.sql` sur la **vraie** prod review (efface users/contenu).
- Changer mots de passe comptes review après envoi notes Apple/Google.
- Modifier gates / Edge / Render **après** gel checklist E (sauf hotfix critique).
- DELETE massif `prime_benefit_grants` / `payment_intents` sans export.

---

## 7. Après nettoyage SQL

1. Rejouer **10 min** : membre review → Agenda/Guide → achat PASS → annuler Djomy.
2. Prime review → contenu Prime + privilèges.
3. Admin mobile : pull refresh Insights (ou réinstall app test).
4. Noter dans un fichier interne : `local_id` catalogues gardés, UUID contenu publié, e-mails review.

---

## 8. Liens

| Doc | Sujet |
|-----|--------|
| `12-Checklist-Validation-Store.md` | Build 58→59, V1–V5 |
| `11-Publication-Stores.md` | Notes relecteurs, confidentialité |
| `15-Lancement-Gates-Prod.md` | PASS intégrité SQL |
| `04-Parametres-Purge-Seed-Ecarts.md` | Purge vs seed |
| `supabase/scripts/cleanup_benefit_catalog_templates.sql` | Privilèges modèles |
