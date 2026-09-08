@echo off
title Setup Evaluation Database
setlocal EnableExtensions
cd /d "%~dp0.."

set "DB_URL=postgresql://fratelanza:fratelanza_dev@localhost:5432/fratelanza_eval?schema=public"

echo %DB_URL% | findstr /I "fratelanza_eval" >nul
if errorlevel 1 (
  echo ERROR: DATABASE_URL must contain fratelanza_eval
  echo Refusing to run destructive setup.
  pause
  exit /b 1
)

echo %DB_URL% | findstr /I "fratelanza_erp" >nul
if not errorlevel 1 (
  echo ERROR: DATABASE_URL must NOT contain fratelanza_erp
  pause
  exit /b 1
)

if not defined POSTGRES_ADMIN_PASSWORD (
  echo.
  echo NOTE: Database fratelanza_eval must exist before migrations run.
  echo If it does not exist, set POSTGRES_ADMIN_PASSWORD and re-run this script,
  echo or create it manually as PostgreSQL superuser:
  echo   CREATE DATABASE fratelanza_eval OWNER fratelanza;
  echo.
) else (
  set "PGPASSWORD=%POSTGRES_ADMIN_PASSWORD%"
  psql -U postgres -h localhost -d postgres -c "CREATE DATABASE fratelanza_eval OWNER fratelanza;" 2>nul
)

echo Running migrations on fratelanza_eval...
call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%~dp0..\.env" -- npm run migrate:server:deploy -w @fratelanza/database
if errorlevel 1 (
  echo Migration failed. Ensure fratelanza_eval exists and PostgreSQL is running.
  pause
  exit /b 1
)

echo Seeding demo businesses...
call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%~dp0..\.env" -- npm run seed:eval -w @fratelanza/database
if errorlevel 1 (
  echo Seed failed.
  pause
  exit /b 1
)

echo.
echo Evaluation database ready: fratelanza_eval
echo Demo credentials: docs\DEMO_CREDENTIALS.md
pause
