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

# Partie A — Tests QA sur build 58 (avant build 59)

Installer **58** sur **iOS + Android**. Cocher au fur et à mesure.

### A1 — Invite & Edge (post-deploy `member-activate-invite`)

| # | Test | Attendu |
|---|------|---------|
| A1a | **S2** Membre invité : Activer → e-mail code **6 chiffres** → compte actif | Vouvoiement messages code |
| A1b | **S3** Partenaire invité : même flux → Espace Pro | Rôle partenaire |
| A1c | **S5** Code **faux** | « Code invalide ou expiré » (texte prod PR #101) |
| A1d | **💻** Admin Inviter → feedback à l’envoi | Pas de jargon technique |

*Déjà PASS en 57 : refaire si tu veux valider **58 + Edge** ensemble.*

### A2 — Textes notifs / privilèges (harmonisation prod PR #101)

| # | Test | Attendu |
|---|------|---------|
| A2a | Octroi privilège → **cloche** membre | Formulation **vous**, menu clair |
| A2b | Partenaire : proposition / refus privilège → notif membre | « Proposition de privilège… », pas de typo |
| A2c | Automatisation / anniversaire (si déclenchable) | Vouvoiement cohérent |

*Au minimum : **A2a** sur un parcours réel.*

### A3 — Auth & compte

| # | Test | Attendu |
|---|------|---------|
| A3a | **Mot de passe oublié** → mail → code / reset | Parcours OK |
| A3b | Connexion membre + Prime (comptes habituels) | Accueil, nav |
| A3c | Compte **jetable** : Fermer mon compte | Demande enregistrée |

### A4 — PASS & Djomy (prod)

| # | Test | Attendu |
|---|------|---------|
| A4a | Gate PASS **ON** : écran achat visible | Prix GNF, pas de crash |
| A4b | Lancer paiement → portail Djomy → **annuler** | Retour app, pas de PASS fantôme |
| A4c | *(Optionnel)* **S8** MTN paiement réel petit montant | PASS actif *(déjà PASS 29 sept.)* |

### A5 — Sécurité / parcours déjà validés (spot check 58)

| # | Test | Attendu | Ref. smoke |
|---|------|---------|------------|
| A5a | Scan QR privilège partenaire | Validation OK | S6 |
| A5b | Prime : demande privilège → validation partenaire → notif | 1 notif, pas de boucle | S7 |
| A5c | Inscription **gate OFF** | Pas d’inscription publique | Gates |
| A5d | **S1b** Code parrain à l’inscription *(si gate ON test)* | Code accepté | RPC 960 |

*Si déjà PASS récemment sur 57 : **A5a** ou **A5b** suffit en spot check.*

### A6 — Contenu & admin (dernière ligne smoke ouverte)

| # | Test | Attendu |
|---|------|---------|
| A6a | **💻📱** Créer / modifier event ou spot : upload **couverture 16:9** | **Aperçu vignette** visible (pas image noire) — *B6 · PR #96 RemoteImage* |
| A6b | **💻** Accueil / Loop : bloc éditorial visible | OK contenu propre |

### A7 — PASS admin (messages activation)

| # | Test | Attendu |
|---|------|---------|
| A7a | **💻** Octroi / activation PASS → message membre (notif ou inbox) | Vouvoiement **vous** (templates prod) |

---

**Sortie Partie A :** A1a–A1c + A2a + A3a–A3b + A4a–A4b + **A6a** OK → lancer **build 59**.

Si **A6a FAIL** (image noire) : corriger sur `main` → **59** inclut le fix.

---

# Partie B — Build 59 (candidat stores)

1. **`mobile/app.json`** : `versionCode` / `buildNumber` → **59**.
2. **`eas build`** iOS + Android (production).
3. **Recheck court** sur **59** (30–45 min) :

| # | Test |
|---|------|
| B1 | Réinstaller 59 · connexion membre review |
| B2 | A4b Djomy annuler (1 fois) |
| B3 | Compte Prime review |
| B4 | **Famille validation** V1–V4 ci-dessous |

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

1. **Partie A** complète sur **58**.  
2. **Build 59** + **Partie B** + **C** + **D**.  
3. **Partie E** (envoi **59**).  
4. **Gel** → ping-pong review.  
5. **Partie F** après approbation.

## Références smoke détaillées

| Sujet | Doc |
|-------|-----|
| S1–S13 sécurité / PASS | `10-Smoke-Exhaustif-Build48.md` Phase 1b |
| B6 couverture | `10-Smoke-Exhaustif-Build48.md` § B6 |
| Suppression, confidentialité | `11-Publication-Stores.md` §1–8 |
