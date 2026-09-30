# Checklist — QA build 58 → build 59 → validation stores (oct.–déc. 2026)

> Complète `11-Publication-Stores.md` (notes relecteurs, PASS, confidentialité) et `10-Smoke-Exhaustif-Build48.md` (smoke global).  
> **Enchaînement retenu :** tout tester sur **build 58** → si OK, **build 59** (dernier binaire) → envoi stores.  
> **Stratégie stores :** review avec **achat PASS ON**, **2 comptes** (membre + Prime), Djomy **annulation seulement** ; après approbation, gates sans nouveau build si le **59 approuvé** a montré l’achat.

---

## Deux familles de tests (ne pas confondre)

| Famille | But | Build |
|---------|-----|--------|
| **A — QA produit** | Regressions depuis le 57, correctifs récents, dernière ligne smoke ouverte | **58** (tout) |
| **B — Validation stores** | Parcours reviewers (2 comptes, PASS, Djomy, gel) | **59** (recheck rapide) après A OK |

---

## Où mettre quoi (stores)

| Contenu | Console | Doc |
|---------|---------|-----|
| Notes review (comptes, Djomy) | App Store / Play — champ privé | `11-Publication-Stores.md` §5 |
| Description publique | Fiche store | Modifiable plus tard sans rebuild |
| Gates prod | Super admin → Paramètres | `15-Lancement-Gates-Prod.md` |

---

# Partie A — Retests **correctifs** sur build 58 (avant build 59)

> **Smoke S1–S13, invite, Djomy, privilèges, auth, parrainage** : déjà PASS chez le testeur (build 57–58) — **ne pas refaire** sauf doute.  
> Ici : uniquement ce qui a été **corrigé dans le code** et pas encore validé sur le binaire installé.

Installer le **58** (ou vérifier date EAS vs commits ci-dessous).

| # | Correctif (commit) | Test minimal | Attendu |
|---|-------------------|--------------|---------|
| **R1** | `4b352e6` — aperçu couverture **Image RN** (build 58) | **📱🤖** Partenaire ou admin mobile : créer/modifier event ou spot → upload **couverture 16:9** | Vignette **visible** (pas noir / pas vide) |
| **R2** | `b139264` — modale code invite **sans Alert superposé** | **📱🤖** Activation invite → saisie **6 chiffres** (membre ou partenaire) | Une seule UI lisible, pas d’Alert par-dessus la modale |
| **R3** | `6688d84` — icône **🎁** cartes avec privilège | **📱** Agenda / Guide : fiche **avec** avantage lié | **🎁 en bas à droite** sur la carte (gate Privilèges **Visible**) |
| **R4** | *(optionnel)* Plafond parrainage / filleuls par an | Admin + compte test (astuce SQL / param admin) | Comportement attendu documenté en smoke **C4** |

**EAS build 58 lancé avant le 29 sept. 21:42 UTC ?** → le **R2** peut manquer dans l’APK : inclure **`main` à jour** dans le **build 59**.

**Sortie Partie A :** **R1 + R2 + R3** OK → **build 59**. Si **R1** encore FAIL → corriger sur `main` puis 59.

Si **A6a FAIL** (image noire) : corriger sur `main` → **59** inclut le fix.

---

# Partie B — Build 59 (candidat stores)

1. **`mobile/app.json`** : `versionCode` / `buildNumber` → **59**.
2. **`eas build`** iOS + Android (production).
3. **Recheck court** sur **59** (~20 min) — **parcours reviewer**, pas tout le smoke :

| # | Test |
|---|------|
| B1 | Réinstaller 59 · **R1** couverture (1 upload) si pas validé sur 58 |
| B2 | Compte **membre review** · connexion · Agenda/Guide |
| B3 | Membre : achat PASS → Djomy → **annuler** |
| B4 | Compte **Prime review** (Prime déjà en admin) |
| B5 | **V4** pré-lancement bypass *(optionnel)* |

---

# Partie C — Tests validation stores (sur build 59)

Gates **figées** à l’envoi :

| Gate | Valeur review |
|------|----------------|
| Inscription | **OFF** |
| Achat PASS | **ON** |
| Privilèges | **Visible** |
| Pré-lancement | **OFF** |

| # | Test | Attendu |
|---|------|---------|
| V1 | Compte **membre review** : parcours app | Stable |
| V2 | Membre : achat → **Djomy → annuler** | Notes review |
| V3 | Compte **Prime review** (Prime **déjà** admin) | Expérience Prime sans achat |
| V4 | Pré-lancement ON → bypass 4 taps *(optionnel avant gel)* | Comportement décembre |
| V5 | Fermer mon compte (jetable) | Stores § suppression |

---

# Partie D — Nettoyage base (avant envoi)

| Action | Détail |
|--------|--------|
| Contenu | ~2 events, 2 spots, 2 outils **propres** |
| Comptes | Garder membre review + Prime review + super admin |
| Historique PASS / paiements | **Ne pas** purger |

Re-smoke **10 min** membre review sur **59**.

---

# Partie E — Envoi stores (build 59) puis **gel**

- [ ] Upload **59** (iOS + Android).
- [ ] Notes FR + EN — `11-Publication-Stores.md` §5.
- [ ] 2 comptes dans les champs review.
- [ ] URL suppression Google OK.

**Jusqu’à « Approuvé » :** ne plus toucher gates, Edge, Render, mots de passe review.  
Rejet technique → **60+** et resoumission.

---

# Partie F — Après approbation

| Moment | Action |
|--------|--------|
| Approbation | Apple : publication **manuelle** ; Google : pas de prod tant que non prêt |
| Décembre | Pré-lancement ON · inscription OFF · PASS ON/OFF selon go-live |
| Description store | Mise à jour possible **sans rebuild** |

---

## Ordre global (résumé)

1. **Partie A** : retests **R1–R3** sur **58** (correctifs seulement).  
2. **Build 59** + **Partie B** (parcours reviewer) + **C** + **D**.  
3. **Partie E** (envoi **59**).  
4. **Gel** → ping-pong review.  
5. **Partie F** après approbation.

## Références smoke détaillées

| Sujet | Doc |
|-------|-----|
| S1–S13 sécurité / PASS | `10-Smoke-Exhaustif-Build48.md` Phase 1b |
| B6 couverture | `10-Smoke-Exhaustif-Build48.md` § B6 |
| Suppression, confidentialité | `11-Publication-Stores.md` §1–8 |
