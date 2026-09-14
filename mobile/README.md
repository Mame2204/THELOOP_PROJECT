# THE LOOP — App native Expo

Application React Native **autonome** : tout le code source vit dans `mobile/src/`. Le dossier `src/` à la racine du monorepo appartient à la **PWA web** (Vite) et n'est **pas** importé par l'app mobile.

## Prérequis

- Node.js 20+
- [Expo Go](https://expo.dev/go) sur votre téléphone (iOS / Android)

## Configuration

1. Copiez vos identifiants Supabase :

```bash
cp .env.example .env
```

Renseignez les mêmes valeurs que la PWA, avec le préfixe `EXPO_PUBLIC_` :

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

2. Installez les dépendances :

```bash
cd mobile
npm install
```

## Lancer l'app

### Méthode simple (recommandée)

**Double-cliquez** sur :

```
scripts\start-mobile.ps1
```

Ou dans PowerShell, depuis la racine du projet :

```powershell
cd c:\Users\MKABA\Desktop\THELOOP_PROJECT
powershell -ExecutionPolicy Bypass -File scripts\start-mobile.ps1
```

> **Important :** n'utilisez pas `npm` tout seul — il n'est pas dans le PATH Windows.
> Le script utilise automatiquement `\.tools\node\npm.cmd`.

### QR code

1. Le QR code s'affiche dans le terminal **interactif** (fenêtre PowerShell ouverte)
2. Scannez-le avec **Expo Go** (Android) ou l'appareil photo (iPhone)
3. Si le QR ne marche pas : appuyez sur **`t`** dans le terminal → mode **tunnel** (marche en 4G)

### Commande manuelle (si besoin)

```powershell
cd c:\Users\MKABA\Desktop\THELOOP_PROJECT\mobile
c:\Users\MKABA\Desktop\THELOOP_PROJECT\.tools\node\npm.cmd start
```

Tunnel (Wi-Fi différent / pare-feu) :

```powershell
c:\Users\MKABA\Desktop\THELOOP_PROJECT\.tools\node\npm.cmd run start:tunnel
```

## Écrans inclus (Phase 4)

| Onglet / écran | Fonction |
|----------------|----------|
| **Agenda** | Événements Supabase + pull-to-refresh |
| **Spots** | Établissements Supabase |
| **Favoris** | Membres connectés uniquement |
| **Profil** | Auth, Prime, partenariat |
| **Détails** | Événement / Spot |
| **Partenariat** | `partnership_requests` Supabase |

## Structure

```
mobile/
  App.tsx
  src/
    context/     Auth, Content, Favorites
    lib/         stores Supabase, auth, contenu (100 % local à mobile/)
    navigation/  Bottom tabs + stack
    screens/
    components/
  babel.config.js   alias @ → ./src
  tsconfig.json     alias @ → src/*
  jsconfig.json     alias @ → src/* (IDE)
  jest.config.js    alias @ → src/*
```
