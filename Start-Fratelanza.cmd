@echo off
title Start Fratelanza
cd /d "%~dp0"

echo.
echo  ==========================================
echo   FRATELANZA - START
echo  ==========================================
echo.
echo  LOGIN:
echo    Username: admin
echo    Password: Eval@2026!Demo
echo  ==========================================
echo.

powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/health' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Server already running - opening app...
  goto :openapp
)

echo Starting server (black window)...
start "Fratelanza API" /D "%~dp0" cmd /k call "%~dp01-Start-API.cmd"

echo Waiting for server...
set /a tries=0
:waitloop
set /a tries+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/v1/health' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto :openapp
if %tries% GEQ 90 (
  echo.
  echo Server did not start. Try Stop-Fratelanza.cmd then run this again.
  pause
  exit /b 1
)
timeout /t 2 /nobreak >nul
goto :waitloop

:openapp
echo Server is ready. Opening app...
call "%~dp02-Open-ERP.cmd"
