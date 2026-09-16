# THE LOOP — Checklist smoke Push (prod)

> **Dernière mise à jour :** septembre 2026  
> **Périmètre :** campagnes push admin (`admin_push_campaigns`) — inbox + push OS  
> **Environnements :** `admin.theloop-app.com`, `api.theloop-app.com`, app mobile build prod

---

## Prérequis

- Compte **super_admin** ou admin avec permission `notifications`
- Au moins **2 comptes test** : un membre (`member`) et un Prime (`prime`) avec token push enregistré
- Migration `20260916_admin_push_campaign_failed_status.sql` appliquée (statut `failed`)
- Serveur Render actif avec cron interne push (`INTERNAL_PUSH_CRON_ENABLED=true`)

---

## 1. Campagne immédiate — audience « Tous »

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Admin-web → Notifications → audience **Comptes (tous rôles)** → envoi immédiat | Statut campagne = `sent`, `recipient_count` > 0 |
| 1.2 | Ouvrir l'app mobile (compte test membre) | Notification visible dans **Boîte de réception** |
| 1.3 | Vérifier notification OS (bannière / centre) | Push reçu **une seule fois** |
| 1.4 | SQL : `SELECT count(*) FROM user_notifications WHERE campaign_id = '<id>'` | Nombre = `recipient_count` |

---

## 2. Campagne planifiée — cron serveur

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | Planifier une campagne **Prime** dans +3 min | Statut = `scheduled` |
| 2.2 | Attendre échéance + 1 cycle cron (~5 min max) | Statut passe à `sent`, `sent_at` renseigné |
| 2.3 | Compte Prime reçoit inbox + push | OK |
| 2.4 | Compte membre free **ne reçoit pas** | OK |

---

## 3. Statut `failed`

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | (Optionnel) Simuler échec RPC : audience invalide en SQL puis cron | Statut = `failed` |
| 3.2 | Admin-web → historique campagnes | Badge **Échec** visible |

---

## 4. Audiences ciblées

### 4a. Favoris par catégorie

- Créer un membre avec favori sur un événement catégorie **X**
- Campagne admin-web : audience **Favoris** → cocher catégorie **X** → immédiat
- Seul le membre concerné (hors admin/partenaire) reçoit la notif

### 4b. Anniversaires du mois

- Compte test avec `birth_date` = mois courant
- Campagne audience **Anniversaires du mois** → immédiat
- Compte reçoit inbox + push ; comptes hors mois exclus

### 4c. Individuel (téléphone)

- Saisir numéro d'un compte existant → immédiat
- Un seul destinataire si numéro unique

---

## 5. Annulation campagne planifiée

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | Planifier campagne dans +30 min | Statut `scheduled` |
| 5.2 | Cliquer **Annuler** (admin-web ou mobile Control Tower) | Statut = `cancelled` |
| 5.3 | Attendre l'échéance | Aucun envoi, statut reste `cancelled` |

---

## 6. Pas de double envoi

| # | Vérification | Résultat attendu |
|---|--------------|------------------|
| 6.1 | Campagne planifiée audience **Membres** (sans filtres favoris) | Traitée **uniquement** par cron serveur |
| 6.2 | App mobile ouverte à l'échéance | Le cron mobile **ignore** la campagne si backend prod configuré |
| 6.3 | Logs Render `[cron]` | `pushCampaignsSent: 1`, pas de doublon inbox |

---

## 7. Parité admin-web ↔ mobile

| Fonctionnalité | Admin-web | Mobile Control Tower |
|----------------|-----------|----------------------|
| Audiences rôles | ✅ | ✅ |
| Favoris multi-catégories | ✅ | ✅ |
| Anniversaires | ✅ | ✅ |
| Planification | ✅ | ✅ |
| Annulation | ✅ | ✅ |
| Statut failed | ✅ | ✅ |

---

## Requêtes SQL utiles

```sql
-- Dernières campagnes
SELECT id, title, audience, status, recipient_count, scheduled_at, sent_at
FROM admin_push_campaigns
ORDER BY created_at DESC
LIMIT 10;

-- Notifications liées à une campagne
SELECT user_id, title, sent_at
FROM user_notifications
WHERE campaign_id = '<campaign_uuid>'
ORDER BY sent_at DESC;
```

---

## Rollback / nettoyage test

```sql
DELETE FROM user_notifications WHERE campaign_id = '<campaign_uuid>';
DELETE FROM admin_push_campaigns WHERE id = '<campaign_uuid>';
```
