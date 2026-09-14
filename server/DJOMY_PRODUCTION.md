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
| `DJOMY_BASE_URL` | `https://sandbox-api.djomy.africa` | URL API prod Djomy (doc dashboard) |
| `DJOMY_CLIENT_ID` / `SECRET` | clés sandbox | clés prod |
| `PAYMENT_SANDBOX_AMOUNTS` | `1` | `0` |
| Webhook dashboard | sandbox URL | `https://api.theloop-app.com/api/webhook/djomy` |
| Return / Cancel | déjà `api.theloop-app.com/payment/*` | inchangé |

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
