@echo off
setlocal
echo === Deploiement Edge Function member-activate-invite uniquement ===
echo.
echo Si deploy-edge-invite.cmd a echoue avec HTTP 500 sur cette fonction, relancez ici.
echo.
set /p SUPABASE_ACCESS_TOKEN=Token Supabase :
if "%SUPABASE_ACCESS_TOKEN%"=="" (
  echo Annule.
  pause
  exit /b 1
)
cd /d "%~dp0"
call "%~dp0run-with-project-node.cmd" scripts\deploy-edge-invite-functions.mjs member-activate-invite
if errorlevel 1 (
  pause
  exit /b 1
)
pause
endlocal
