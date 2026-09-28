@echo off
setlocal
echo === Configuration e-mails invitation THE LOOP (Supabase Auth) ===
echo.
echo Token : https://supabase.com/dashboard/account/tokens
echo   Nom libre (ex. the-loop-scripts) ^| Expiration 90 j ou plus ^| Projet THE LOOP
echo   Permissions : acces COMPLET sur ce projet (pas Read only — les scripts modifient Auth + secrets)
echo   Copiez sbp_... des l ecran de creation (visible une seule fois)
echo   PAS les cles anon / service_role (Settings ^> API du projet)
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
