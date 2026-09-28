@echo off
setlocal
echo === Activer le code e-mail pour les invitations (Edge secret) ===
echo.
echo Meme token que configure-auth-invite-email.cmd :
echo   https://supabase.com/dashboard/account/tokens
echo   (Access Token personnel, souvent sbp_... — PAS la cle anon/service du projet)
echo.
echo Pour DESACTIVER le secret : meme token + scripts\set-invite-require-email-code.mjs false
echo.
set /p SUPABASE_ACCESS_TOKEN=Token Supabase :
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Annule.
  pause
  exit /b 1
)
cd /d "%~dp0"
call "%~dp0run-with-project-node.cmd" scripts\set-invite-require-email-code.mjs true
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
pause
endlocal
