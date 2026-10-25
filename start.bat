@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js tidak ditemukan. Instal Node.js 18 atau lebih baru dari https://nodejs.org
  echo.
  pause
  exit /b 1
)

node server.js

if errorlevel 1 (
  echo.
  echo Server berhenti. Periksa pesan di atas jika ini tidak disengaja.
  pause
)
