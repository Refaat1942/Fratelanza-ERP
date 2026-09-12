@echo off
setlocal
cd /d "%~dp0.."

echo Fratelanza G-ERP Production Deploy
echo ===================================
echo.
echo 1. Build web frontend
call npm run build:web
if errorlevel 1 exit /b 1

echo.
echo 2. Build API Docker image
docker compose -f infra/docker/docker-compose.prod.yml build api
if errorlevel 1 exit /b 1

echo.
echo 3. Start production stack
docker compose -f infra/docker/docker-compose.prod.yml up -d
if errorlevel 1 exit /b 1

echo.
echo Deploy started. Configure SSL with certbot on the VPS:
echo   certbot certonly --webroot -w /var/www/certbot -d G-ERP.fratelanza.com
echo.
echo DNS required:
echo   Type: A
echo   Host: G-ERP
echo   Value: ^<your VPS public IPv4^>
echo.
endlocal
