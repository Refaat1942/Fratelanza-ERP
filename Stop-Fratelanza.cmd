@echo off
title Stop Fratelanza
cd /d "%~dp0"

echo Stopping anything on port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo Stopping process %%a
  taskkill /PID %%a /F >nul 2>&1
)

echo Done. You can now run Start-Fratelanza.cmd
pause
