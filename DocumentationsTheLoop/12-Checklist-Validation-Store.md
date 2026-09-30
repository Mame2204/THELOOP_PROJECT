# Checklist — build 58 → validation stores (oct.–déc. 2026)

> Complète `11-Publication-Stores.md` (notes relecteurs, PASS, confidentialité).  
> **Stratégie retenue :** soumettre **build 58** avec **achat PASS visible à la review** (gate ON), **2 comptes** (membre + Prime), paiement Djomy **jusqu’à annulation seulement** ; après approbation, piloter **gates** sans nouveau build tant que le binaire approuvé est le même.

---

## Où mettre quoi (rappel)

| Contenu | App Store Connect / Play Console | Repo |
|---------|----------------------------------|------|
| Comptes test, Djomy, annulation | **Notes pour la vérification** (privé) | Modèle §5 dans `11-Publication-Stores.md` |
| Description publique, captures | Fiche store (public) | Optionnel `content/` — **modifiable en prod sans nouveau build** |
| Confidentialité | Formulaires Apple / Google | `11-Publication-Stores.md` §2–3 |
| Gates (PASS, pré-lancement, inscription) | **Super admin → Paramètres** (prod) | `15-Lancement-Gates-Prod.md` |

**Ne pas écrire dans la description publique** « aucun achat dans l’app » si l’achat est **visible pendant la review**. Tu peux garder une description orientée guide / privilèges sans détailler la vente en ligne ; la mise à jour marketing du PASS se fera plus tard en prod.

---

## Phase 1 — Tests sur build 58 (maintenant)

Installer **58** sur **iOS + Android**.

| # | Test | Attendu |
|---|------|---------|
| T1 | Gates **review** : inscription **OFF**, achat PASS **ON**, privilèges **Visible**, pré-lancement **OFF** | État figé pour l’envoi |
| T2 | **Compte membre review** : connexion, Accueil, Agenda, Guide, Profil | Pas de crash |
| T3 | Membre : lancer achat PASS → portail **Djomy** → **annuler** | Retour app OK, pas de PASS activé par erreur |
| T4 | **Compte Prime review** (Prime **déjà** octroyé admin, pas via Djomy) | Privilèges, contenu Prime |
| T5 | Membre : pas de régression invite (code 6 chiffres) si retest nécessaire | Optionnel si PASS 57 |
| T6 | Compte **jetable** : Fermer mon compte | Demande envoyée |
| T7 | Aperçu couverture event/spot (B6) | Noter si image noire — non bloquant validation |

**Sortie :** T1–T4 OK → Phase 2.

---

## Phase 2 — Nettoyage base (recommandé, avant envoi)

| Action | Détail |
|--------|--------|
| Contenu | ~2 events, 2 spots, 2 outils **propres** ; retirer remplissage test |
| Comptes | Anonymiser / supprimer comptes test inutiles ; **garder** membre review + Prime review + super admin |
| PASS / paiements | **Ne pas** purger l’historique compta |
| Re-smoke | 10 min avec **compte membre review** sur build 58 |

---

## Phase 3 — Jour d’envoi (puis **gel**)

### A. Prod (super admin)

| Gate | Valeur |
|------|--------|
| Inscription | **OFF** |
| Achat PASS | **ON** |
| Privilèges | **Visible** |
| Pré-lancement | **OFF** (pendant toute la review) |

### B. Consoles

- [ ] Attacher **build 58** (iOS + Android).
- [ ] Coller **notes FR** (+ **EN** pour Apple) — `11-Publication-Stores.md` §5.
- [ ] Renseigner **2 comptes** (membre + Prime) dans les champs dédiés si la console le propose.
- [ ] Vérifier URL suppression Google : https://www.theloop-app.com/suppression
- [ ] Description publique : relecture rapide (pas de contradiction avec achat visible à la review).

### C. Règle jusqu’à « Approuvé »

**Ne plus modifier :** gates, Edge, Render, migrations lourdes, contenu massif, mots de passe des comptes review.

**Ping-pong review (oct. → nov. / déc.) :** répondre aux questions ; nouveau build **59+** **uniquement** si rejet technique ou binaire à corriger.

---

## Phase 4 — Après approbation (avant / jour J décembre)

| Moment | Action |
|--------|--------|
| Approbation reçue | **Apple :** publication **manuelle** (ne pas publier tout de suite si objectif décembre). **Google :** ne pas lancer rollout prod tant que non prêt. |
| Pré-lancement | Gate **ON** + countdown si besoin |
| Ouverture publique déc. | Inscription **OFF** (invite-only) ; achat PASS **OFF** ou **ON** selon go-live vente (même binaire si déjà approuvé avec achat vu) |
| Description store | **Mise à jour autorisée en prod** (texte, captures) sans nouveau build |

**Activer / désactiver l’achat après approbation :** gate `passPurchaseEnabled` — **pas de nouvelle review** si le parcours achat a été **montré et décrit** lors de la validation initiale (cf. `11-Publication-Stores.md` §6).

---

## Phase 5 — Pendant la review uniquement

- Répondre aux messages Apple / Google.
- Si demande de démo paiement : renvoyer vers **annulation Djomy** + **compte Prime** pour l’expérience complète.
- Ne **pas** repasser PASS **OFF** pendant qu’ils testent (incohérent avec les notes).

---

## Référence rapide — ordre des étapes

1. Tests **T1–T4** sur build 58.  
2. Nettoyage base + re-smoke membre.  
3. Gates review + notes + upload 58 → **soumettre**.  
4. **Gel** jusqu’à approbation.  
5. Publication / décembre via gates + description (sans rebuild si même binaire).
