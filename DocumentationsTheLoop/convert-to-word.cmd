@echo off
cd /d "%~dp0.."
.\.tools\node\node.exe DocumentationsTheLoop\convert-to-docx.mjs
pause
