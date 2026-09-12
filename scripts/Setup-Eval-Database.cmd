@echo off
title Setup Evaluation Database
setlocal EnableExtensions
cd /d "%~dp0.."

set "DB_URL=postgresql://fratelanza:fratelanza_dev@localhost:5432/fratelanza_eval?schema=public"
set "FRATELANZA_DB_PASSWORD=fratelanza_dev"

echo %DB_URL% | findstr /I "fratelanza_eval" >nul
if errorlevel 1 (
  echo ERROR: DATABASE_URL must contain fratelanza_eval
  pause
  exit /b 1
)

echo %DB_URL% | findstr /I "fratelanza_erp" >nul
if not errorlevel 1 (
  echo ERROR: DATABASE_URL must NOT contain fratelanza_erp
  pause
  exit /b 1
)

echo.
echo Checking evaluation database...

REM --- Check if fratelanza_eval exists (use fratelanza app user + correct password) ---
set "PGPASSWORD=%FRATELANZA_DB_PASSWORD%"
psql -U fratelanza -h localhost -d fratelanza_eval -c "SELECT current_database();" >nul 2>&1
if not errorlevel 1 (
  echo Database fratelanza_eval exists — OK
  goto :migrate
)

echo Database fratelanza_eval not found yet.

if not defined POSTGRES_ADMIN_PASSWORD goto :need_pgadmin

REM Trim accidental trailing spaces from typed password
for /f "tokens=* delims= " %%a in ("%POSTGRES_ADMIN_PASSWORD%") do set "POSTGRES_ADMIN_PASSWORD=%%a"

echo Testing postgres superuser login...
set "PGPASSWORD=%POSTGRES_ADMIN_PASSWORD%"
psql -U postgres -h localhost -d postgres -c "SELECT 1;" >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Could not log in as postgres with that password.
  echo.
  echo Common mistakes:
  echo   - You entered fratelanza_dev ^(app password^) instead of postgres password
  echo   - pgAdmin uses a saved password for a different user
  echo   - Extra space at end of password when typing
  echo.
  echo EASIEST FIX — use pgAdmin instead:
  echo   1. Open pgAdmin, connect as postgres
  echo   2. Query Tool, run:
  echo        CREATE DATABASE fratelanza_eval OWNER fratelanza;
  echo   3. Run this setup again and press ENTER at the password prompt
  echo.
  pause
  exit /b 1
)

echo Creating fratelanza_eval...
psql -U postgres -h localhost -d postgres -c "CREATE DATABASE fratelanza_eval OWNER fratelanza;"
if errorlevel 1 (
  echo ERROR: CREATE DATABASE failed. See message above.
  pause
  exit /b 1
)
echo Database created successfully.
goto :migrate

:need_pgadmin
echo.
echo To create the database, either:
echo   1. Run this script again and enter your postgres password, OR
echo   2. In pgAdmin ^(Query Tool^) run:
echo        CREATE DATABASE fratelanza_eval OWNER fratelanza;
echo      Then run this setup again and press ENTER at the password prompt.
echo.
pause
exit /b 1

:migrate
echo.
echo Running migrations on fratelanza_eval...
set "DATABASE_URL=%DB_URL%"
call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%~dp0..\.env" -- npm run migrate:server:deploy -w @fratelanza/database
if errorlevel 1 (
  echo.
  echo Migration failed. See error above.
  pause
  exit /b 1
)

echo.
echo Seeding demo businesses...
set "DATABASE_URL=%DB_URL%"
call "%ProgramFiles%\nodejs\npx.cmd" dotenv -e "%~dp0..\.env" -- npm run seed:eval -w @fratelanza/database
if errorlevel 1 (
  echo Seed failed.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  SUCCESS — Evaluation database ready
echo  Login: admin / Eval@2026!Demo
echo  Next: double-click Start-Fratelanza.cmd
echo ============================================
pause
