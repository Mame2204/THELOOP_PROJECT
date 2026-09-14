@echo off
echo.
setlocal

echo === Deploiement page confirmation e-mail (Supabase Edge Function) ===
echo.
echo 1. Ouvrez https://supabase.com/dashboard/account/tokens
echo 2. Creez un token (nom : the-loop-deploy)
echo 3. Collez-le ci-dessous
echo.

set /p SUPABASE_ACCESS_TOKEN=Token Supabase : 

if "%SUPABASE_ACCESS_TOKEN%"=="" (
    echo Token vide, annule.
    pause
    exit /b 1
)

set "NODE_DIR=%~dp0.tools\node"
set "PATH=%NODE_DIR%;%PATH%"

cd /d "%~dp0"
"%NODE_DIR%\node.exe" scripts\deploy-auth-callback-api.mjs
if errorlevel 1 (
    pause
    exit /b 1
)

echo.
echo Dans Supabase - Authentication - URL Configuration :
echo   Site URL      : https://eeyhtulpixvftvhppinz.supabase.co/functions/v1/auth-callback
echo   Redirect URLs : la meme URL + theloop://** + exp://**
echo.
pause
endlocal
