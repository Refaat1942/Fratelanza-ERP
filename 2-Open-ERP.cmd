@echo off
title Fratelanza ERP App
cd /d "%~dp0"

echo Building the app (first time may take 1-2 minutes)...
call "%ProgramFiles%\nodejs\npm.cmd" run build --workspace=@fratelanza/desktop
if errorlevel 1 (
  echo.
  echo Build failed. Make sure Node.js is installed.
  pause
  exit /b 1
)

echo.
echo Opening Fratelanza...
cd /d "%~dp0apps\desktop"
start "" /D "%~dp0apps\desktop" "%ProgramFiles%\nodejs\npx.cmd" electron .
