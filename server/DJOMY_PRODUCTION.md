# Passage Djomy production (phase C)

À faire **après** que `https://api.theloop-app.com/health` fonctionne.

## Dossier marchand (hors code)

1. Compte prod : https://djomy.africa/register  
2. Pièces : CNI du responsable légal, RCCM, NIF, RIB  
3. Activité en Guinée + domaine / IP : `api.theloop-app.com`  
4. Attendre validation Djomy + clés **production**

## Bascule technique (PaaS)

| Variable | Sandbox | Production |
|----------|---------|------------|
| `DJOMY_BASE_URL` | `https://sandbox-api.djomy.africa` | `https://api.djomy.africa` |
| `DJOMY_PARTNER_API_KEY` | *(vide)* | code marchand (hash Djomy) → header **`X-PARTNER-DOMAIN`** sur toutes les requêtes |
| `DJOMY_CLIENT_ID` / `SECRET` | clés sandbox | clés **production** (dashboard marchand) |
| `PAYMENT_SANDBOX_AMOUNTS` | `1` | `0` |
| Webhook dashboard | sandbox URL | `https://api.theloop-app.com/api/webhook/djomy` |
| Return / Cancel | déjà `api.theloop-app.com/payment/*` | inchangé |

Le serveur envoie le header **`X-PARTNER-DOMAIN`** (nom corrigé par Djomy — **pas** `X-PARTNER-API`) sur **auth**, **create payment** et **verify status**.  
**Valeur** = le **code** fourni par Djomy (`DJOMY_PARTNER_API_KEY`), pas l’URL `api.theloop-app.com`. Djomy hache ce code côté marchand. Obligatoire en prod si `DJOMY_BASE_URL` = `api.djomy.africa`.

## Demande whitelist firewall / domaine (support Djomy)

Si Djomy indique que le **firewall bloque votre domaine**, leur transmettre la fiche ci-dessous.  
Symptôme actuel : `POST https://api.djomy.africa/v1/auth` → **403 Forbidden** (HTML nginx), alors que sandbox → **200** avec le même Client ID.

### Marchand

| Champ | Valeur |
|-------|--------|
| Application | **THE LOOP** |
| Marchand (JWT sandbox) | **Aely** |
| Client ID | `djomy-client-1786649977930-5dca` |
| Pays | Guinée (GN) |
| Activité | Paiement abonnement PASS (mobile money + portail Djomy) |

### Domaines à autoriser (whitelist)

| Domaine | Usage |
|---------|--------|
| `api.theloop-app.com` | API paiement (Render + TLS) — **principal** |
| `theloop-app.com` | Site public |
| `www.theloop-app.com` | Site public |
| `admin.theloop-app.com` | Console admin |

### URLs HTTPS à valider côté Djomy

| Type | URL exacte |
|------|------------|
| Webhook (POST) | `https://api.theloop-app.com/api/webhook/djomy` |
| Return succès | `https://api.theloop-app.com/payment/success` |
| Return annulation | `https://api.theloop-app.com/payment/cancel` |
| Healthcheck | `https://api.theloop-app.com/health` |

### Appels sortants (serveur → Djomy)

Notre backend **Render** (`api.theloop-app.com`) appelle :

- `POST https://api.djomy.africa/v1/auth`
- `POST https://api.djomy.africa/v1/payments/gateway`
- `GET https://api.djomy.africa/v1/payments/{id}/status`

Merci d’**activer l’API production** pour ce Client ID (ou de fournir des credentials prod dédiés) **et** d’autoriser le domaine `api.theloop-app.com`.

### Critère de succès

Après whitelist : `POST https://api.djomy.africa/v1/auth` avec nos clés prod → **HTTP 200 JSON** (plus de 403 HTML).  
Nous vérifions via `https://api.theloop-app.com/health` → `djomyAuthOk: true`.

---

## Header Djomy — clarification support

| Élément | Valeur correcte |
|---------|-----------------|
| **Nom du header** | `X-PARTNER-DOMAIN` (pas `X-PARTNER-API`) |
| **Valeur du header** | Code hex fourni par Djomy → env `DJOMY_PARTNER_API_KEY` |
| **Portée** | **Toutes** les requêtes (`/v1/auth`, gateway, status) |

Vérifier le deploy : `/health` → `partnerCodeConfigured: true`, `partnerHeader: "X-PARTNER-DOMAIN"`.

---

## Dépannage HTTP 403 « Djomy auth »

Ouvrir `https://api.theloop-app.com/health` :

| Champ | Signification |
|-------|----------------|
| `djomyAuthOk: false` | Le serveur ne peut pas s'authentifier chez Djomy → paiement PASS impossible |
| `djomyAuthStatus: 403` + hint HTML Cloudflare | **Compte prod non activé** ou blocage WAF Djomy — pas un bug THE LOOP. Contacter Djomy. |
| `djomyAuthStatus: 401` sur sandbox avec clés prod | Normal : clés prod invalides sur sandbox. |
| `sandboxMode: false` + tests Soutra/PayCard | Montants réels (850k GNF) — attendu seulement en prod |

Diagnostic local : `..\.tools\node\node.exe scripts/probe-djomy-auth.mjs`

| Résultat probe | Signification |
|----------------|---------------|
| prod **200** | Prod OK — déployer / retester PASS |
| prod **403 HTML** + sandbox **200** (mêmes clés) | **Clés sandbox sur URL prod** — demander à Djomy les credentials **production** + activation API |
| prod **403 HTML** + sandbox **401/403** | Clés invalides ou compte non activé — contacter Djomy |
| prod **401 JSON** | Mauvaises clés prod sur Render |

**Correctif smoke (Render → Environment → redeploy) :**

```
DJOMY_BASE_URL=https://sandbox-api.djomy.africa
PAYMENT_SANDBOX_AMOUNTS=1
DJOMY_CLIENT_ID=<clés sandbox dashboard Djomy>
DJOMY_CLIENT_SECRET=<clés sandbox dashboard Djomy>
DJOMY_PARTNER_API_KEY=   ← laisser vide en sandbox
```

Test local : `cd server && node scripts/test-djomy.mjs` (doit afficher `AUTH status 200`).

## Smoke test

1. Gate admin **Achat PASS = ON** (temporaire)  
2. Montant réel minimal (mensuel catalogue)  
3. Paiement OM / PayCard **réel**  
4. Vérifier `payment_intents` (status paid + fulfilled) + rôle Prime  
5. Remettre **Achat PASS = OFF** si le lancement public n’est pas encore ouvert  

## Ne pas oublier

- Les tarifs facturés viennent du serveur / `app_settings`, pas du client.  
- Orange Money **sandbox** échoue toujours ; en **prod** OM doit fonctionner.  
- Pas de rebuild mobile obligatoire si seule l’URL API / les secrets serveur changent.
