@echo off
echo.
setlocal

echo.

echo === Connexion Expo via TOKEN ===

echo.

echo 1. Ouvrez https://expo.dev/settings/access-tokens

echo 2. Creez un token (nom : the-loop-pc)

echo 3. Collez-le ci-dessous

echo.

set /p EXPO_TOKEN=Token Expo : 

if "%EXPO_TOKEN%"=="" (

    echo Token vide, annule.

    pause

    exit /b 1

)

set "NODE_DIR=%~dp0.tools\node"

set "PATH=%NODE_DIR%;%PATH%"

cd /d "%~dp0mobile"

echo Verification...

call "%NODE_DIR%\npx.cmd" expo whoami >nul 2>&1

if errorlevel 1 (

    echo Echec connexion. Verifiez le token.

    pause

    exit /b 1

)

call "%NODE_DIR%\npx.cmd" expo whoami

echo.

echo Demarrage Expo...
echo (Depuis le dossier THELOOP_PROJECT : cd .. si vous etes dans mobile\)
echo.

cd /d "%~dp0"

call "%~dp0mobile-tunnel.cmd"

endlocal