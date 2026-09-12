@echo off
title Fratelanza API Server
setlocal EnableExtensions

REM Project root = parent of the scripts folder (do not copy this file elsewhere)
set "ROOT=%~dp0.."
if not exist "%ROOT%\apps\api\package.json" (
  echo.
  echo  Cannot find the Fratelanza ERP project folder.
  echo.
  echo  Run THIS file from the project, not a desktop copy:
  echo    D:\Refaat\My Projects\Fratelanza Grand ERP\scripts\Start-Fratelanza-API.bat
  echo.
  pause
  exit /b 1
)

cd /d "%ROOT%\apps\api"

if not exist "dist\main.js" (
  echo.
  echo  Building API once — please wait...
  echo.
  cd /d "%ROOT%"
  call "%ProgramFiles%\nodejs\npm.cmd" run build --workspace=apps/api
  if errorlevel 1 (
    echo.
    echo  Build failed. Open Command Prompt and send the error to support.
    pause
    exit /b 1
  )
  cd /d "%ROOT%\apps\api"
)

echo.
echo  Fratelanza API
echo  --------------
echo  Starting on http://localhost:3000
echo.
echo  KEEP THIS WINDOW OPEN while you use the desktop app.
echo.

if exist "%ROOT%\.env.staging-license" (
  call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%ROOT%\.env" -e "%ROOT%\.env.staging-license" -- node dist/main.js
) else (
  call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%ROOT%\.env" -- node dist/main.js
)

echo.
echo  API stopped.
pause
