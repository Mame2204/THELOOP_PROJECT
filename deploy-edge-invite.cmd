@echo off
setlocal
echo === Deploiement Edge Functions invitation (auth-callback + admin-send-invite) ===
echo.
echo 1. Ouvrez https://supabase.com/dashboard/account/tokens
echo 2. Creez un token (nom : the-loop-deploy)
echo 3. Collez-le ci-dessous
echo.
set /p SUPABASE_ACCESS_TOKEN=Token Supabase :
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Annule.
  pause
  exit /b 1
)
set "NODE_DIR=%~dp0.tools\node"
cd /d "%~dp0"
"%NODE_DIR%\node.exe" scripts\deploy-edge-invite-functions.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
pause
endlocal
