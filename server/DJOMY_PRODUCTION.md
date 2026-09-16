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
| `DJOMY_PARTNER_API_KEY` | *(vide)* | clé fournie par Djomy → header `X-PARTNER-API` |
| `DJOMY_CLIENT_ID` / `SECRET` | clés sandbox | clés **production** (dashboard marchand) |
| `PAYMENT_SANDBOX_AMOUNTS` | `1` | `0` |
| Webhook dashboard | sandbox URL | `https://api.theloop-app.com/api/webhook/djomy` |
| Return / Cancel | déjà `api.theloop-app.com/payment/*` | inchangé |

Le serveur envoie `X-PARTNER-API` sur **create payment** et **verify status** (pas sur `/v1/auth`, conforme à la spec [afro.tools Djomy](https://afro.tools/providers/djomy)). Obligatoire en prod si `DJOMY_BASE_URL` = `api.djomy.africa`.

## Dépannage HTTP 403 « Djomy auth »

Ouvrir `https://api.theloop-app.com/health` :

| Champ | Signification |
|-------|----------------|
| `djomyAuthOk: false` | Le serveur ne peut pas s'authentifier chez Djomy → paiement PASS impossible |
| `djomyProduction: true` + clés sandbox | **Cause n°1** — URL prod avec clés sandbox → 403 Cloudflare |
| `sandboxMode: false` + tests Soutra/PayCard | Montants réels (850k GNF) — attendu seulement en prod |

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
