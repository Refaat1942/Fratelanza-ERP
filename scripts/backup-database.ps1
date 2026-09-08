# Fratelanza PostgreSQL backup script (Windows customer server)
# Usage: .\scripts\backup-database.ps1 [-OutputDir backups]

param(
  [string]$OutputDir = "backups"
)

$ErrorActionPreference = "Stop"

function Get-DatabaseUrl {
  if ($env:DATABASE_URL) { return $env:DATABASE_URL }
  $envFile = Join-Path (Get-Location) ".env"
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
        return $matches[1].Trim().Trim('"').Trim("'")
      }
    }
  }
  throw "DATABASE_URL not found in environment or .env"
}

$url = Get-DatabaseUrl
if ($url -notmatch '^postgresql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)') {
  throw "Unsupported DATABASE_URL format"
}

$user = $matches[1]
$pass = $matches[2]
$hostName = $matches[3]
$port = if ($matches[4]) { $matches[4] } else { "5432" }
$db = $matches[5]

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump not found. Install PostgreSQL client tools and ensure pg_dump is on PATH."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutputDir "fratelanza_erp_${timestamp}.sql"

$env:PGPASSWORD = $pass
try {
  & pg_dump -h $hostName -p $port -U $user -d $db -F p -f $outFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
  Write-Host "Backup created: $outFile"
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
