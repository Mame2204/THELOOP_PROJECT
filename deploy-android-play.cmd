@echo off
echo.
setlocal

echo === THE LOOP — Android test via Google Play Console (AAB) ===
echo.
echo  Format        : AAB (App Bundle)
echo  Profil EAS    : production
echo  Distribution  : Tests internes Play Console (upload manuel)
echo  Djomy         : masque (PASS_PURCHASE_UI_ENABLED=false)
echo.

set "NODE_DIR=%~dp0.tools\node"
set "PATH=%NODE_DIR%;%PATH%"

cd /d "%~dp0mobile"

echo [1/4] Synchronisation package-lock...
call "%NODE_DIR%\npm.cmd" install
if errorlevel 1 (
    echo Echec npm install
    pause
    exit /b 1
)

echo.
echo [2/4] Verification Expo...
call "%NODE_DIR%\npx.cmd" eas whoami
if errorlevel 1 (
    echo Connectez Expo : mobile-token-login.cmd
    pause
    exit /b 1
)

echo.
echo [3/4] versionCode actuel (app.json) — incrementer avant chaque upload Play :
findstr /C:"versionCode" app.json

echo.
echo [4/4] Build AAB cloud (~20 min)...
set EAS_BUILD_NO_EXPO_GO_WARNING=true
set /p LAUNCH=Lancer le build Android production (AAB) ? (O/N) :
if /I not "%LAUNCH%"=="O" (
    echo.
    echo Commande manuelle :
    echo   cd mobile
    echo   set EAS_BUILD_NO_EXPO_GO_WARNING=true
    echo   ..\.tools\node\npx.cmd eas build --platform android --profile production
    pause
    exit /b 0
)

call "%NODE_DIR%\npx.cmd" eas build --platform android --profile production --non-interactive
if errorlevel 1 (
    echo Echec build.
    pause
    exit /b 1
)

echo.
echo === Build termine ===
echo.
echo 1. Ouvrez https://expo.dev/accounts/theloops/projects/theloop/builds
echo 2. Cliquez sur le dernier build Android ^> Download ^> Application Archive (.aab)
echo.
echo 3. Google Play Console :
echo    https://play.google.com/console
echo    THE LOOP ^> Tests ^> Tests internes ^> Creer une version
echo    ^> Uploader le .aab ^> Enregistrer ^> Examiner ^> Deployer
echo.
echo 4. Testeurs : ajoutez vos e-mails dans Tests internes ^> Testeurs
echo    Le lien d'installation arrive par e-mail (pas de QR Expo)
echo.
pause
endlocal
