@echo off
setlocal
set "ROOT=%~dp0"
set "NODE_EXE=%ROOT%.tools\node\node.exe"
if exist "%NODE_EXE%" (
  "%NODE_EXE%" %*
  exit /b %ERRORLEVEL%
)
where node >nul 2>&1
if not errorlevel 1 (
  node %*
  exit /b %ERRORLEVEL%
)
echo.
echo [ERREUR] Node.js introuvable pour lancer le script.
echo.
echo   1. Utilisez le dossier .tools\node du projet (meme principe que configure-auth-invite-email.cmd)
echo   2. OU installez Node.js : https://nodejs.org puis relancez
echo.
echo Racine attendue du repo : %ROOT%
exit /b 1
