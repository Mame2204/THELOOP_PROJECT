@echo off
setlocal
echo === Test URLs activation invitation (API / Edge / Storage) ===
echo.
set "NODE_DIR=%~dp0.tools\node"
cd /d "%~dp0"
"%NODE_DIR%\node.exe" scripts\test-auth-invite-urls.mjs
echo.
pause
endlocal
