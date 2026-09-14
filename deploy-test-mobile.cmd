@echo off
echo.
setlocal

echo === THE LOOP — Deploiement test Android + iOS (EAS preview) ===
echo.
echo  Djomy / achat PASS : MASQUE (PASS_PURCHASE_UI_ENABLED=false)
echo  Supabase prod      : eeyhtulpixvftvhppinz
echo  Profil EAS         : preview (distribution interne)
echo.

set "NODE_DIR=%~dp0.tools\node"
set "PATH=%NODE_DIR%;%PATH%"

cd /d "%~dp0mobile"

echo [1/5] Synchronisation package-lock (obligatoire avant EAS)...
call "%NODE_DIR%\npm.cmd" install
if errorlevel 1 (
    echo Echec npm install
    pause
    exit /b 1
)

echo.
echo [2/5] Verification connexion Expo...
call "%NODE_DIR%\npx.cmd" eas whoami
if errorlevel 1 (
    echo.
    echo Echec : connectez Expo d'abord avec mobile-token-login.cmd
    pause
    exit /b 1
)

echo.
echo [3/5] Versions app (app.json) — Android versionCode / iOS buildNumber = 16
findstr /C:"versionCode" /C:"buildNumber" app.json

echo.
echo [4/5] RAPPEL Supabase Dashboard (une fois, si pas deja fait)
echo   Authentication - URL Configuration :
echo     Site URL      : theloop://auth/callback
echo     Redirect URLs : theloop://**  +  exp://**
echo   Migrations 70-74 appliquees sur le projet prod
echo.

echo.
echo [5/5] Builds EAS (cloud, ~20-40 min chacun)
echo   Android : profil production (AAB — Google Play Console tests internes)
echo   iOS     : profil production (TestFlight)
echo.
set /p LAUNCH=Lancer les deux builds maintenant ? (O/N) :
if /I not "%LAUNCH%"=="O" (
    echo Annule. Android Play Console : deploy-android-play.cmd
    echo   cd mobile
    echo   ..\.tools\node\npx.cmd eas build --platform android --profile production
    pause
    exit /b 0
)

set EAS_BUILD_NO_EXPO_GO_WARNING=true
echo.
echo --- Android (production / AAB pour Play Console) ---
call "%NODE_DIR%\npx.cmd" eas build --platform android --profile production --non-interactive
if errorlevel 1 (
    echo Echec build Android.
    pause
    exit /b 1
)

echo.
echo --- iOS (production / TestFlight) ---
call "%NODE_DIR%\npx.cmd" eas build --platform ios --profile production --non-interactive
if errorlevel 1 (
    echo Echec build iOS. Relancez en interactif :
    echo   npx eas build --platform ios --profile production
    pause
    exit /b 1
)

echo.
echo === Termine ===
echo Suivi : https://expo.dev/accounts/theloops/projects/theloop/builds
echo.
echo Android : telecharger le .aab sur expo.dev ^> Play Console ^> Tests internes
echo iOS     : TestFlight (eas submit --platform ios --latest)
echo.
pause
endlocal
