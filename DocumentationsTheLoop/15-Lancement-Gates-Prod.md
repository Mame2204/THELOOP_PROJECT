# Gates lancement (phase D)

Contrôle sans rebuild via super admin mobile → **Paramètres**.

| Gate | Défaut code | Usage lancement |
|------|-------------|-----------------|
| Inscription (`signupEnabled`) | **OFF** (invite-only) | Rester OFF jusqu’à ouverture contrôlée |
| Achat PASS (`passPurchaseEnabled`) | **OFF** | ON seulement pour tests / go-live paiement |
| Pré-lancement | OFF | Message / countdown si besoin |
| Maintenance | OFF | Coupure urgente |

## Supabase egress

- Monitorer Dashboard Supabase → Usage  
- Pendant tests intensifs : anticiper le passage à un plan supérieur  
- Les écrans admin paginent (users 20, paiements 30) pour limiter les lectures

## Stores

1. Builds internes (TestFlight / Play internal) avec `api.theloop-app.com`  
2. Décembre : store public + invite-only (`signupEnabled` false)  
3. Achat PASS public : plus tard, gate ON + Djomy prod
