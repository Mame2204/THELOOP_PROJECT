@echo off
echo.
echo === THE LOOP - Expo LAN pour iPhone ===
echo.
echo Pare-feu (admin, UNE SEULE FOIS - optionnel si Android marche deja) :
echo   Clic droit sur ensure-expo-firewall.cmd ^> Executer en tant qu administrateur
echo.
echo Demarrage Metro LAN (sans admin)...
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\start-mobile.ps1" -Lan
pause
