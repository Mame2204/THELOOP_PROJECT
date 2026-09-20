# THE LOOP — Documentation projet (état actuel)

> **Dernière mise à jour :** août 2026  
> **Périmètre :** application mobile Expo (`mobile/`) + backend Supabase (`supabase/`) + PWA web legacy (`src/`)  
> **Public :** équipe produit, développement, exploitation sandbox

---

## Objectif de ce dossier

Ce répertoire centralise la **compréhension complète** du projet THE LOOP à l’état actuel du code et de la base de données, après les migrations `20260711` → `20260831` et les scripts sandbox (`purge`, `seed`).

Il répond notamment aux questions suivantes :

- Qu’est-ce que fait l’application, pour qui, avec quels parcours ?
- Quelles tables Supabase existent, que contiennent-elles, sont-elles **paramètres** ou **données opérationnelles** ?
- Pourquoi, après une purge SQL, des **clics**, **octrois**, **catégories** ou **insights** peuvent encore apparaître ?
- Quelle est la différence entre **migrations**, **seed** et **cache téléphone** ?

---

## Index des documents

| # | Markdown | Word (.docx) |
|---|----------|--------------|
| Index | [README.md](./README.md) | [Word/README.docx](./Word/README.docx) |
| 1 | [01-Vue-Ensemble-Fonctionnelle.md](./01-Vue-Ensemble-Fonctionnelle.md) | [Word/01-Vue-Ensemble-Fonctionnelle.docx](./Word/01-Vue-Ensemble-Fonctionnelle.docx) |
| 2 | [02-Architecture-Technique-Etat-Actuel.md](./02-Architecture-Technique-Etat-Actuel.md) | [Word/02-Architecture-Technique-Etat-Actuel.docx](./Word/02-Architecture-Technique-Etat-Actuel.docx) |
| 3 | [03-Referentiel-Complet-Tables-Supabase.md](./03-Referentiel-Complet-Tables-Supabase.md) | [Word/03-Referentiel-Complet-Tables-Supabase.docx](./Word/03-Referentiel-Complet-Tables-Supabase.docx) |
| 4 | [04-Parametres-Purge-Seed-Ecarts.md](./04-Parametres-Purge-Seed-Ecarts.md) | [Word/04-Parametres-Purge-Seed-Ecarts.docx](./Word/04-Parametres-Purge-Seed-Ecarts.docx) |
| 5 | [05-Cache-Local-Telephone-AsyncStorage.md](./05-Cache-Local-Telephone-AsyncStorage.md) | [Word/05-Cache-Local-Telephone-AsyncStorage.docx](./Word/05-Cache-Local-Telephone-AsyncStorage.docx) |
| 6 | [06-Roles-Permissions-Navigation.md](./06-Roles-Permissions-Navigation.md) | [Word/06-Roles-Permissions-Navigation.docx](./Word/06-Roles-Permissions-Navigation.docx) |
| 7 | [07-Smoke-Push.md](./07-Smoke-Push.md) | — |
| 8 | [08-Smoke-Global.md](./08-Smoke-Global.md) | — |
| 9 | [09-Smoke-Retest-Build48.md](./09-Smoke-Retest-Build48.md) | — |

**Document unique Word (tout en un) :** [Word/THE_LOOP_Documentation_Complete.docx](./Word/THE_LOOP_Documentation_Complete.docx)

### Régénérer les fichiers Word après modification des .md

```powershell
.\.tools\node\node.exe DocumentationsTheLoop\convert-to-docx.mjs
```

Ou double-clic : `DocumentationsTheLoop\convert-to-word.cmd`

---

## Contenu détaillé (Markdown)

---

## Scripts SQL essentiels (ordre sandbox)

```
1. supabase/scripts/promote_super_admin.sql     ← votre compte super_admin
2. supabase/scripts/purge_all_except_super_admin.sql
3. supabase/scripts/seed_platform_defaults.sql  ← optionnel si reset paramètres canoniques
4. supabase/scripts/seed_guinea_locations.sql   ← référentiel 4549 quartiers (si besoin)
```

---

## Rappel critique (post-purge)

| Couche | Vidée par purge ? | Source de vérité après purge |
|--------|-------------------|------------------------------|
| Tables opérationnelles Supabase | **Oui** (TRUNCATE) | Supabase = vide |
| Tables paramètres Supabase | **Non** (conservées) | Supabase = dernière valeur admin ou seed |
| Cache AsyncStorage (téléphone) | **Non** | Peut afficher d’**anciennes** données jusqu’au refresh / réinstall |

Voir [05-Cache-Local-Telephone-AsyncStorage.md](./05-Cache-Local-Telephone-AsyncStorage.md) pour le détail.

---

## Dépendances projet

- **Mobile :** React Native + Expo, React Navigation, Supabase JS 2
- **Web (legacy) :** React 19 + Vite 6 + Tailwind 4 dans `src/` (PWA Conakry, règles `.cursorrules`)
- **Backend :** Supabase (PostgreSQL + Auth + RLS + RPC)
- **Paiement PASS :** Djomy (Orange Money / carte) — table `payment_intents`

---

## Fichiers de référence code

| Domaine | Chemins |
|---------|---------|
| Entrée mobile | `mobile/App.tsx`, `mobile/src/navigation/RootNavigator.tsx` |
| Auth & rôles | `mobile/src/context/AuthContext.tsx`, `mobile/src/types/index.ts` |
| Stores data | `mobile/src/lib/*.ts` (~150 modules) |
| Migrations BDD | `supabase/migrations/*.sql` (99 fichiers) |
| Schéma legacy | `supabase/schema.sql` (**ne pas appliquer sur prod migrée sans audit**) |
| Purge / seed | `supabase/scripts/purge_all_except_super_admin.sql`, `seed_platform_defaults.sql` |
