@echo off
title Photo Upload Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install --omit=dev
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

rem Optional overrides (remove "rem" to use):
rem set UPLOAD_DIR=D:\Some\Other\Folder
rem set PORT=3000
rem set PUBLIC_URL=https://your-tunnel.trycloudflare.com

node server.js
pause
