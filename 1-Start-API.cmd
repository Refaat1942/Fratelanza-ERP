@echo off
title Fratelanza API - DO NOT CLOSE
cd /d "%~dp0"

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/health' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo  Server is ALREADY running on port 3000.
  echo  You can close this window and use the app.
  echo.
  pause
  exit /b 0
)

if not exist "apps\api\dist\main.js" (
  echo Building API once, please wait...
  call "%ProgramFiles%\nodejs\npm.cmd" run build --workspace=@fratelanza/api
  if errorlevel 1 (
    echo API build failed.
    pause
    exit /b 1
  )
)

if not exist "packages\database\generated\server\index.js" (
  echo Preparing database client...
  call "%ProgramFiles%\nodejs\npm.cmd" run db:generate
)

echo.
echo  API running at http://localhost:3000
echo  DO NOT CLOSE THIS WINDOW
echo.

set "DATABASE_URL=postgresql://fratelanza:fratelanza_dev@localhost:5432/fratelanza_eval?schema=public"
call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e ".env" -- node "apps\api\dist\main.js"
if errorlevel 1 (
  echo.
  echo If you see "EADDRINUSE" above, the server is already running.
  echo Close ALL black windows, then run Start-Fratelanza.cmd again.
  echo Or run Stop-Fratelanza.cmd first.
)
pause
