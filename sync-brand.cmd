@echo off
cd /d "%~dp0mobile"
call "..\.tools\node\node.exe" scripts\sync-brand-assets.mjs
pause
