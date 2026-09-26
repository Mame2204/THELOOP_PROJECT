@echo off
setlocal
echo === Test URLs activation invitation (API / Edge / Storage) ===
echo Aucun token Supabase requis — teste uniquement les URLs publiques.
echo.
cd /d "%~dp0"
call "%~dp0run-with-project-node.cmd" scripts\test-auth-invite-urls.mjs
echo.
pause
endlocal
