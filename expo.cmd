@echo off
REM Lance npx/eas/expo avec le Node du projet (.tools\node)
set "NODE_DIR=%~dp0.tools\node"
set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0mobile"
"%NODE_DIR%\npx.cmd" %*
