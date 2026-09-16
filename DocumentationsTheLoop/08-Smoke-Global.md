# Smoke THE LOOP — iPhone

> Build **37** · Admin-web + serveur à redeployer · **EAS quota :** build 37 quand quota OK

---

## Tags

| Tag | Quand |
|-----|-------|
| **B36** | Build 36 installé (TestFlight actuel) |
| **B37** | Build 37 requis (auth bienvenue, etc.) |
| **WEB** | Après redeploy admin-web |
| **SRV** | Après redeploy Render |
| **WEB+SRV** | Les deux |

---

## 0 · Préparation

- [ ] iPhone · app build **36** ou **37**
- [ ] Comptes : visiteur · membre · prime · partenaire · admin
- [ ] Safari → `admin.theloop-app.com` (admin)
- [ ] **WEB+SRV** redeploys faits

---

## A · Auth

- [ ] **B37** Inscription → mail → lien → connecté
- [ ] **B37** Notif **Bienvenue** inbox immédiate
- [ ] **B36/B37** Connexion · déconnexion OK
- [ ] **B36/B37** MDP oublié → mail → **formulaire in-app** nouveau MDP
- [ ] **WEB+SRV** Page HTTPS auth-callback : reset MDP **sans app**
- [ ] **B36/B37** Activer compte invité (lien mail)
- [ ] **WEB** Admin → Users → Invite → mail reçu
- [ ] **WEB** Waitlist → pré-créer → statut `invited`
- [ ] Gate inscription OFF → pas d’inscription publique

---

## B · Visiteur / Membre

- [ ] **B36** Nav : Agenda · Guide · Favoris (bottom)
- [ ] **B36** Pas contenu Prime · pas pill LoopX
- [ ] **B36** Détail event / spot / outil
- [ ] **B36** Favori + persiste après relaunch
- [ ] **B36** Profil · édition OK

---

## C · Loop Prime

- [ ] **B36** Thème sombre · pills LoopX / Prime
- [ ] **B36** Contenu exclusif visible
- [ ] **B36** Nav : Répertoire · Abonnement
- [ ] **B36** Favoris via menu bonhomme
- [ ] **B36** Scan privilège QR OK
- [ ] **B36** PASS Djomy (si gate ON) · succès → prime

---

## D · Partenaire

- [ ] **B36** Login SPOT
- [ ] **B36** Soumission → staging pending
- [ ] **B36** Admin approuve → public
- [ ] **B36** Demande retrait → badge admin
- [ ] **B36** Retrait approuvé → dépublié
- [ ] **WEB** Retrait visible admin-web

---

## E · Admin mobile

- [ ] **B36** Modération staging
- [ ] **B36** Users · TEAMS overrides
- [ ] **B36** Paiements · refs Djomy · Resync
- [ ] **B36** Push mobile · planifier · annuler
- [ ] **B36** Partenariat → jeton SPOT
- [ ] **B36** Waitlist → pré-créer

---

## F · Admin-web

- [ ] **WEB** Login · permissions menu
- [ ] **WEB** Users · invite · waitlist
- [ ] **WEB** Contenu · créer / modifier (ContentEditor)
- [ ] **WEB** Accueil · sondage · parcours · singulier
- [ ] **WEB** TEAMS · toggles privilèges
- [ ] **WEB** Types privilège · standalone
- [ ] **WEB** Paiements · CSV · analytics
- [ ] **WEB** Étoiles · onglets Spots / Outils / Parcours
- [ ] **WEB** Automatisations · **Exécuter** (push)
- [ ] **WEB** Notifications · favoris · anniversaires · annuler

---

## G · Push (WEB+SRV)

- [ ] **WEB+SRV** Immédiat audience Tous → inbox + push OS 1×
- [ ] **WEB+SRV** Planifié Prime +3 min → cron → `sent`
- [ ] **WEB+SRV** Favoris catégorie · immédiat
- [ ] **WEB+SRV** Anniversaires · immédiat
- [ ] **WEB+SRV** Annuler campagne planifiée
- [ ] **WEB+SRV** Statut `failed` si erreur
- [ ] **WEB+SRV** Pas double envoi mobile + cron

---

## H · Parrainage & notifs

- [ ] **B36** Code parrain · filleul compté
- [ ] **B36** 10 filleuls → mois Prime parrain
- [ ] **B36** Inbox · lu · supprimer
- [ ] **B36** Push OS (foreground + background)

---

## I · Régression (5 min)

- [ ] **B36** Cold start · pas crash
- [ ] **B36** Background → retour OK
- [ ] **B36** Images contenu OK
- [ ] **B36** Admin publie → visible membre (refresh)

---

## J · Quota EAS — plus tard

- [ ] Build **37** soumis TestFlight (quota reset)
- [ ] Refaire sections **B37** ci-dessus sur build 37

---

## Notes

```
Date :
iPhone / iOS :
Build testé :
Admin-web déployé : oui / non
Serveur déployé : oui / non
Bloquants :
```
