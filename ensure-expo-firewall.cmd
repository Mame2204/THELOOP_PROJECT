@echo off
REM Ouvre le port Metro 8082 — clic droit > Executer en tant qu'administrateur
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-expo-firewall.ps1"
echo.
pause
