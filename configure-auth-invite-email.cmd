@echo off
setlocal
echo === Configuration e-mails invitation THE LOOP (Supabase Auth) ===
echo.
echo Creez un token : https://supabase.com/dashboard/account/tokens
echo.
set /p SUPABASE_ACCESS_TOKEN=Token Supabase :
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Annule.
  pause
  exit /b 1
)
cd /d "%~dp0"
call "%~dp0run-with-project-node.cmd" scripts\configure-auth-invite-email.mjs
pause
endlocal
