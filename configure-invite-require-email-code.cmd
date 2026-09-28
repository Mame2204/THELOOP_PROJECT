@echo off
setlocal
echo === Activer le code e-mail pour les invitations (Edge secret) ===
echo.
echo Prerequis : token Supabase dans server\.env (SUPABASE_ACCESS_TOKEN)
echo             ou variable d'environnement SUPABASE_ACCESS_TOKEN
echo.
echo Pour DESACTIVER : node scripts\set-invite-require-email-code.mjs false
echo.
cd /d "%~dp0"
call "%~dp0run-with-project-node.cmd" scripts\set-invite-require-email-code.mjs true
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
pause
endlocal
