@echo off
setlocal
cd /d "%~dp0"

echo.
echo THE LOOP — Application migration RLS 20260870_harden_core_rls.sql
echo Projet Supabase : eeyhtulpixvftvhppinz
echo.

where npx >nul 2>&1
if errorlevel 1 (
  echo [ERREUR] npx introuvable.
  exit /b 1
)

echo Tentative via Supabase CLI...
call npx supabase link --project-ref eeyhtulpixvftvhppinz
if errorlevel 1 (
  echo.
  echo [INFO] CLI non lie — appliquez le SQL manuellement :
  echo   1. Ouvrez https://supabase.com/dashboard/project/eeyhtulpixvftvhppinz/sql/new
  echo   2. Collez le contenu de supabase\migrations\20260870_harden_core_rls.sql
  echo   3. Executez la requete
  echo.
  exit /b 1
)

call npx supabase db push
if errorlevel 1 (
  echo [ERREUR] db push echoue — utilisez le SQL Editor comme ci-dessus.
  exit /b 1
)

echo.
echo [OK] Migration RLS appliquee.
exit /b 0
