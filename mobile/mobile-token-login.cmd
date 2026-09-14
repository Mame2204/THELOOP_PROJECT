@echo off
REM Les scripts .cmd sont a la racine du projet (dossier parent).
cd /d "%~dp0.."
echo Dossier : %CD%
echo.
call "%~dp0..\mobile-token-login.cmd"
