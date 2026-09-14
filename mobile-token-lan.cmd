@echo off
echo.
setlocal

echo.

echo === Connexion Expo via TOKEN (mode LAN) ===

echo.

echo PC et telephone doivent etre sur le MEME Wi-Fi.

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

echo Demarrage Expo (mode LAN)...

cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-mobile.ps1" -Lan

endlocal