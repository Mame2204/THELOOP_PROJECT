@echo off
REM THE LOOP — Purge sandbox Supabase (super_admin + guinea_locations uniquement)
REM
REM Prerequis :
REM   - Supabase CLI installe et projet lie (supabase link)
REM   - OU copier le SQL dans le SQL Editor du dashboard
REM
REM Usage :
REM   purge-sandbox.cmd
REM   purge-sandbox.cmd --with-seed

setlocal
set SCRIPT_DIR=%~dp0
set PURGE_SQL=%SCRIPT_DIR%purge_all_except_super_admin.sql
set SEED_SQL=%SCRIPT_DIR%seed_platform_defaults.sql

where supabase >nul 2>&1
if errorlevel 1 (
  echo.
  echo [INFO] Supabase CLI introuvable.
  echo Ouvrez Supabase Dashboard ^> SQL Editor et executez dans l'ordre :
  echo   1. promote_super_admin.sql  ^(si pas encore super_admin^)
  echo   2. purge_all_except_super_admin.sql
  if "%~1"=="--with-seed" echo   3. seed_platform_defaults.sql
  echo.
  echo Fichiers : %SCRIPT_DIR%
  exit /b 0
)

echo.
echo === THE LOOP — Purge sandbox ^(super_admin seul^) ===
echo.

supabase db execute --file "%PURGE_SQL%"
if errorlevel 1 (
  echo [ERREUR] Echec purge. Verifiez promote_super_admin.sql puis relancez.
  exit /b 1
)

if "%~1"=="--with-seed" (
  echo.
  echo === Seed parametres plateforme ===
  supabase db execute --file "%SEED_SQL%"
  if errorlevel 1 exit /b 1
)

echo.
echo [OK] Purge terminee. Reconnectez-vous avec le compte super_admin.
endlocal
