# THE LOOP — Smoke test complet (à cocher)

> **Màj :** 16 sept. 2026 · Coche `- [ ]` → `- [x]` au fur et à mesure  
> **App mobile :** build **36** (TestFlight / Play internal)  
> **Admin web :** `https://admin.theloop-app.com`  
> **Serveur :** `https://api.theloop-app.com` (cron push, paiements)

---

## Les 4 rôles (comptes connectés)

| Rôle | C’est qui ? | DB `user_role` | Comment tester |
|------|-------------|----------------|----------------|
| **Membre** | Compte **gratuit** | `member` | Inscription ou compte test membre |
| **Prime** | Abonné **Loop Prime** (PASS actif) | `prime` | Compte avec PASS actif ou octroi admin |
| **Partenaire** | Pro THE LOOP | `partner` | Compte pro (e-mail) **ou** jeton SPOT |
| **Admin** | Control Tower | `admin` / `super_admin` | Compte admin · app + admin-web |

### Non connecté ≠ un rôle

Quand tu n’es **pas** connecté, tu n’es pas « visiteur » qui parcourt l’app : tu es sur l’**écran Auth** uniquement.

| État | Accès |
|------|--------|
| **Non connecté** | Auth · partenariat · validation privilège (double tap logo) · **aucun** Accueil / Agenda / Spots |
| **Connecté** | Un des **4 rôles** ci-dessus → onglets catalogue |

> **Termes obsolètes :** « visiteur », « sans compte = persona » — ne plus les utiliser.  
> En code : `USER_ANONYMOUS` = état technique « pas de session », pas un rôle produit.

---

## Où tester ? (symboles)

| Symbole | Où | URL / app |
|---------|-----|-----------|
| **📱** | iPhone | App THE LOOP (TestFlight) |
| **🤖** | Android | App THE LOOP (Play internal) |
| **💻** | Admin web | `https://admin.theloop-app.com` |
| **⏳** | Après redeploy | Admin-web + Render à jour (push planifiés, cron) |

**Render** = pas de site à ouvrir. Tu crées la campagne sur **💻**, tu attends 5–10 min, tu vérifies sur **📱/🤖**.

**🔜 Build 37+** = auth bienvenue améliorée, e-mail support `contact@theloop-app.com` dans le binaire (build 36 peut encore afficher l’ancien e-mail en dur).

---

## 0 — Avant de commencer

### Environnement
- [ ] **📱** Build **36** installé (TestFlight)
- [ ] **🤖** Build **36** installé (Play internal)
- [ ] **💻** Admin-web accessible
- [ ] **⏳** Redeploy admin-web + Render faits (si tests push planifiés § H)

### Migrations Supabase appliquées
- [ ] `20260916_admin_push_campaign_failed_status.sql` (statut `failed`)
- [ ] `20260916_support_email_contact_theloop_app.sql` (e-mail `contact@theloop-app.com` dans FAQ / légal / pages)

### Comptes test prêts
- [ ] Membre (`member`)
- [ ] Prime (`prime` + PASS actif)
- [ ] Partenaire (e-mail pro **ou** jeton `SPOT-DEMO-2026`)
- [ ] Admin (`admin` ou `super_admin`)

### Base propre
- [ ] `payment_intents` nettoyés (plus d’alertes « Paiement bloqué — PASS non activé » en cron)

---

# A — Non connecté (gate Auth)

*Pas un rôle — état avant connexion.*

### Écran bloqué sur Auth
- [ ] **📱** App ouverte déconnecté → écran **Connexion** (pas Accueil)
- [ ] **🤖** Idem
- [ ] **📱** Pas de bottom nav · pas d’onglets catalogue
- [ ] **🤖** Idem
- [ ] **📱** Impossible d’atteindre Agenda, Spots, Outils, Favoris, fiches détail
- [ ] **🤖** Idem

### Parcours autorisés (stack Auth)
- [ ] **📱** Connexion e-mail + mot de passe
- [ ] **🤖** Idem
- [ ] **📱** Inscription (si gate inscription **ON**)
- [ ] **🤖** Idem
- [ ] **📱** Gate inscription **OFF** → pas d’onglet Inscription (invite-only)
- [ ] **🤖** Idem
- [ ] **📱** « Mot de passe oublié ? »
- [ ] **🤖** Idem
- [ ] **📱** « Activer un compte invité par l’équipe »
- [ ] **🤖** Idem
- [ ] **📱** Lien **Pro ? Rejoindre THE LOOP →** (demande partenariat)
- [ ] **🤖** Idem
- [ ] **📱** CGU / Politique de confidentialité (modales légales)
- [ ] **🤖** Idem

### Validation privilège (double tap logo)
- [ ] **📱** **Double tap** logo THE LOOP → écran **Code établissement**
- [ ] **🤖** Idem
- [ ] **📱** Code partenaire `CODE-XXXXX` → scan / validation privilège membre
- [ ] **🤖** Idem
- [ ] **📱** Retour Auth possible
- [ ] **🤖** Idem

### Ce qui doit rester bloqué
- [ ] **📱** Aucun contenu catalogue (événement, spot, outil, parcours, singulier)
- [ ] **🤖** Idem
- [ ] **📱** Pas de favoris · pas de recherche catalogue
- [ ] **🤖** Idem

---

# B — Membre gratuit

*Compte `member` connecté — pas Prime.*

### Navigation & thème
- [ ] **📱** Bottom nav : **Accueil · Agenda · Spots · Outils · Favoris · Profil** (selon sections admin actives)
- [ ] **🤖** Idem
- [ ] **📱** Thème **teal clair** (membre gratuit)
- [ ] **🤖** Idem
- [ ] **📱** Pas de badge Prime sur Profil
- [ ] **🤖** Idem

### Catalogue & favoris
- [ ] **📱** Accueil : hero, sondage, blocs éditoriaux (selon config admin)
- [ ] **🤖** Idem
- [ ] **📱** Agenda / Spots / Outils : liste + fiche détail
- [ ] **🤖** Idem
- [ ] **📱** Contenu `visibility: prime` **non visible**
- [ ] **🤖** Idem
- [ ] **📱** Ajouter / retirer favori · relancer app → persiste
- [ ] **🤖** Idem

### Profil & upgrade
- [ ] **📱** Profil : QR membre · parrainage · paramètres
- [ ] **🤖** Idem
- [ ] **📱** Carte « Découvrir Prime » visible (si gate achat PASS ON)
- [ ] **🤖** Idem
- [ ] **📱** Pas d’accès aux privilèges Prime octroyés
- [ ] **🤖** Idem

### Notifications
- [ ] **📱** Boîte notifications · lire · marquer lu
- [ ] **🤖** Idem
- [ ] **📱** Push OS si campagne admin ciblée « Membres »
- [ ] **🤖** Idem

---

# C — Loop Prime

*Compte `prime` + PASS actif.*

### Apparence
- [ ] **📱** Thème **indigo** Loop Prime
- [ ] **🤖** Idem
- [ ] **📱** Badge Prime sur onglet Profil
- [ ] **🤖** Idem

### Navigation & contenu
- [ ] **📱** Mêmes onglets que membre (+ accès contenu exclusif Prime)
- [ ] **🤖** Idem
- [ ] **📱** Profil → **Abonnement / Mon PASS** · historique PASS
- [ ] **🤖** Idem
- [ ] **📱** Profil → **Mes avantages** / privilèges octroyés
- [ ] **🤖** Idem
- [ ] **📱** Contenu et offres réservés Prime accessibles
- [ ] **🤖** Idem

### Privilèges & scan
- [ ] **📱** Scanner QR privilège partenaire → validation OK
- [ ] **🤖** Idem
- [ ] **📱** Utiliser un privilège octroyé → succès côté partenaire
- [ ] **🤖** Idem

### Achat PASS Djomy (si gate PASS ON)
- [ ] **📱** Écran Abonnement · prix GNF affiché
- [ ] **🤖** Idem
- [ ] **📱** Paiement Orange Money ou carte · succès
- [ ] **🤖** Idem
- [ ] **📱** Rôle Prime actif · notif confirmation
- [ ] **🤖** Idem
- [ ] **💻** Paiement visible admin-web → Paiements
- [ ] **📱** Échec paiement → message clair · pas Prime fantôme
- [ ] **🤖** Idem

---

# D — Partenaire Pro

*Compte `partner` ou session SPOT.*

### Connexion
- [ ] **📱** Connexion compte pro (e-mail + MDP) **ou** jeton SPOT valide
- [ ] **🤖** Idem
- [ ] **📱** Thème **vert teal** partenaire
- [ ] **🤖** Idem

### Navigation
- [ ] **📱** Bottom nav inclut onglet **Pro** (+ Accueil, Agenda, Spots, Outils, Favoris, Profil selon sections)
- [ ] **🤖** Idem
- [ ] **📱** **Stats** accessibles depuis Espace Pro (pas dans la barre)
- [ ] **🤖** Idem

### Publications
- [ ] **📱** Soumettre événement → statut **pending**
- [ ] **🤖** Idem
- [ ] **📱** Soumettre spot / outil → pending
- [ ] **🤖** Idem
- [ ] **📱** Modifier une soumission pending
- [ ] **🤖** Idem
- [ ] **📱** Voir rejet admin + motif · resoumettre
- [ ] **🤖** Idem

### Retrait & favoris
- [ ] **📱** Demander retrait d’un contenu **publié**
- [ ] **🤖** Idem
- [ ] **📱** Annuler demande retrait (si encore pending)
- [ ] **🤖** Idem
- [ ] **📱** Notif quand admin approuve / refuse retrait
- [ ] **🤖** Idem
- [ ] **💻** Demande visible admin-web → Demandes
- [ ] **📱** Favoris via onglet **Favoris**
- [ ] **🤖** Idem

### Validation privilèges
- [ ] **📱** Scan QR membre · validation code partenaire
- [ ] **🤖** Idem
- [ ] **📱** Code établissement `CODE-XXXXX` fonctionnel
- [ ] **🤖** Idem

---

# E — Admin mobile (Control Tower)

*Connecté admin dans l’app **📱/🤖**.*

### Accès & thème
- [ ] **📱** Onglet **Administration** visible
- [ ] **🤖** Idem
- [ ] **📱** Thème bordeaux (super admin) ou gris bleu (admin délégué)
- [ ] **🤖** Idem
- [ ] **📱** Modules masqués selon permissions
- [ ] **🤖** Idem

### Modération
- [ ] **📱** Voir soumissions pending partenaire
- [ ] **🤖** Idem
- [ ] **📱** Approuver → contenu public
- [ ] **🤖** Idem
- [ ] **📱** Rejeter + motif → partenaire informé
- [ ] **🤖** Idem
- [ ] **📱** Approuver / refuser **retrait** partenaire
- [ ] **🤖** Idem

### Users & équipe
- [ ] **📱** Liste users · pagination · filtre inactifs 30j
- [ ] **🤖** Idem
- [ ] **📱** Changer rôle · suspendre compte
- [ ] **🤖** Idem
- [ ] **📱** TEAMS · activer/désactiver privilège par membre
- [ ] **🤖** Idem
- [ ] **📱** Permissions admin délégué (super admin)
- [ ] **🤖** Idem

### PASS & paiements
- [ ] **📱** Gestion PASS · prix Guinée (super admin)
- [ ] **🤖** Idem
- [ ] **📱** Paiements · refs Djomy · **Resync**
- [ ] **🤖** Idem
- [ ] **📱** Octroi manuel privilège
- [ ] **🤖** Idem

### Contenu & accueil
- [ ] **📱** Publier / archiver contenu
- [ ] **🤖** Idem
- [ ] **📱** Accueil : hero · sondage · parcours · singulier
- [ ] **🤖** Idem
- [ ] **📱** Partenariat approuvé → jeton SPOT généré
- [ ] **🤖** Idem
- [ ] **📱** Idée utilisateur → préremplir éditeur contenu
- [ ] **🤖** Idem

### Push (Control Tower mobile)
- [ ] **📱** Notifications → envoi immédiat audience « Tous »
- [ ] **🤖** Idem
- [ ] **📱** Planifier campagne · **Annuler** une planifiée
- [ ] **🤖** Idem
- [ ] **📱** Audiences favoris · anniversaires
- [ ] **🤖** Idem

---

# F — Auth & comptes

*Flux transverses — tous rôles.*

### Connexion / déconnexion
- [ ] **📱** Connexion e-mail + MDP → **Accueil**
- [ ] **🤖** Idem
- [ ] **📱** Déconnexion → retour **Auth** (contenu inaccessible)
- [ ] **🤖** Idem

### Inscription & e-mail
- [ ] **📱** Inscription → mail reçu → clic lien → connecté
- [ ] **🤖** Idem
- [ ] **🔜** Notif **Bienvenue** inbox immédiate après 1ʳᵉ connexion (build 37+)
- [ ] **📱** Gate inscription OFF → inscription bloquée (invite-only)
- [ ] **🤖** Idem

### Mot de passe oublié
- [ ] **📱** « Mot de passe oublié » → mail reçu
- [ ] **🤖** Idem
- [ ] **📱** Clic lien → **écran nouveau MDP dans l’app**
- [ ] **🤖** Idem
- [ ] **📱** Connexion avec nouveau MDP OK
- [ ] **🤖** Idem

### Invitations & waitlist
- [ ] **💻** Users → **Inviter** → mail invitation reçu
- [ ] **📱** Clic lien → compte activé · bon rôle
- [ ] **🤖** Idem
- [ ] **💻** Users → **Waitlist** → pré-créer compte → statut `invited`
- [ ] **📱** Admin mobile → Waitlist → pré-créer (même flux)
- [ ] **🤖** Idem

---

# G — Admin web (bureau)

*Tout sur **💻** `admin.theloop-app.com`.*

### Accès
- [ ] **💻** Login admin · session stable
- [ ] **💻** Sélecteur pays GN · données filtrées
- [ ] **💻** Menu masque modules sans permission

### Users · PASS · paiements
- [ ] **💻** Users · liste · édition · invite · waitlist
- [ ] **💻** PASS · prix · octrois manuels
- [ ] **💻** Paiements · liste · Resync · refs Djomy
- [ ] **💻** Export CSV · analytics revenus
- [ ] **💻** Demandes · modération · retraits partenaire

### Contenu
- [ ] **💻** Contenu · liste events / spots / outils
- [ ] **💻** Créer / modifier (ContentEditor)
- [ ] **💻** À la une · archiver
- [ ] **💻** Idée → ouvrir éditeur prérempli

### Accueil · Loop · étoiles
- [ ] **💻** Accueil · sondage · parcours · singulier · logos
- [ ] **💻** Loop hub · privilèges
- [ ] **💻** Étoiles · spots (et outils / parcours si dispo)
- [ ] **💻** TEAMS · toggles overrides par membre

### Paramètres
- [ ] **💻** Gates · pays · catégories · permissions · legal
- [ ] **💻** Types privilège · standalone benefit
- [ ] **💻** Automatisations · jobs · exécuter (si bouton présent)
- [ ] **💻** Horaires · onglets · milestones · tirage

### Notifications (admin-web)
- [ ] **💻** Envoi immédiat · audience Tous
- [ ] **💻** Audiences : favoris · anniversaires · individuel
- [ ] **💻** Planifier · annuler campagne
- [ ] **💻** Historique · statuts `sent` / `failed` / `cancelled`

> Détail push : voir aussi `07-Smoke-Push.md`

---

# H — Push notifications

### Immédiat (sans attendre le serveur)
- [ ] **💻** Campagne immédiate « Membres » → statut `sent`
- [ ] **📱** Compte membre : inbox + push OS **1 fois**
- [ ] **🤖** Idem Android
- [ ] **📱** Compte Prime **ne reçoit pas** (si ciblage membre seul)
- [ ] **🤖** Idem

### Planifié (**⏳** redeploy admin-web + Render)
- [ ] **⏳💻** Planifier campagne Prime dans **+3 minutes**
- [ ] **⏳** Attendre 5–10 min (cron serveur)
- [ ] **⏳💻** Statut passe à `sent`
- [ ] **⏳📱** Compte Prime reçoit inbox + push
- [ ] **⏳🤖** Idem Android
- [ ] **⏳💻** Annuler une campagne planifiée → `cancelled` · pas d’envoi

### Pas de doublon
- [ ] **⏳** Une campagne planifiée = **1 seule** notif (pas 2 push)

### Échec (`failed`)
- [ ] **💻** Campagne en échec → badge **Échec** dans l’historique

---

# I — Contact & support

- [ ] **📱** Profil → pied de page **contact@theloop-app.com**
- [ ] **🤖** Idem
- [ ] **📱** Feuille contact (WhatsApp / e-mail) → `mailto:contact@theloop-app.com`
- [ ] **🤖** Idem
- [ ] **📱** FAQ / pages / CGU (contenu Supabase) → e-mail **contact@theloop-app.com** (après migration)
- [ ] **🤖** Idem

---

# J — Parrainage

- [ ] **📱** Code parrain visible profil membre
- [ ] **🤖** Idem
- [ ] **📱** Nouveau filleul inscrit → compteur parrain +1
- [ ] **🤖** Idem
- [ ] **📱** 10 filleuls / an → mois Prime parrain (si seuil atteint en test)
- [ ] **🤖** Idem

---

# K — Régression rapide (5 min)

- [ ] **📱** Cold start · pas crash au lancement
- [ ] **🤖** Idem
- [ ] **📱** App en arrière-plan · retour → OK
- [ ] **🤖** Idem
- [ ] **📱** Images contenu chargées (pas tout gris)
- [ ] **🤖** Idem
- [ ] **📱** Admin publie → membre voit après refresh
- [ ] **🤖** Idem
- [ ] **📱** Pas lag / refresh excessif en navigation normale
- [ ] **🤖** Idem

---

# L — Parité iPhone vs Android

*Coche seulement si les **deux** OK.*

- [ ] **📱🤖** Non connecté → Auth bloqué identique
- [ ] **📱🤖** Login / logout identique
- [ ] **📱🤖** Navigation par rôle identique
- [ ] **📱🤖** Push OS reçu sur les deux
- [ ] **📱🤖** Partenaire : soumission + modération OK
- [ ] **📱🤖** Admin : modération OK
- [ ] **📱🤖** PASS Djomy (si testé) OK des deux côtés

---

# M — Plus tard (non bloquant)

- [ ] **🔜** Build **37** TestFlight + Play (quota EAS)
- [ ] **🔜** E-mail support dans le binaire app (build 37+)
- [ ] **🔜** Refaire § F (bienvenue immédiate) sur build 37
- [ ] **🔜** Reset MDP via page web sans app installée

---

## Notes de session

```
Date :
Testeur :
Build iPhone :
Build Android :
Admin-web à jour : oui / non
Serveur Render à jour : oui / non
Migration e-mail appliquée : oui / non
Bloquants trouvés :
```
