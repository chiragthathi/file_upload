@echo off
title Photo Upload Server (public link)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public.ps1"
pause
