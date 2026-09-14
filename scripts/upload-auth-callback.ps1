# THE LOOP — Publie public/auth-callback.html sur Supabase Storage (bucket app-public)
# Usage : powershell -ExecutionPolicy Bypass -File scripts\upload-auth-callback.ps1
# Requiert SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY dans server\.env

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$HtmlPath = Join-Path $ProjectRoot 'public\auth-callback.html'
$ServerEnv = Join-Path $ProjectRoot 'server\.env'
$BucketId = 'app-public'
$ObjectPath = 'auth/auth-callback.html'

if (-not (Test-Path $HtmlPath)) {
  Write-Host 'Fichier introuvable : public\auth-callback.html' -ForegroundColor Red
  exit 1
}

function Read-DotEnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.+?)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

$url = Read-DotEnvValue -Path $ServerEnv -Key 'SUPABASE_URL'
$key = Read-DotEnvValue -Path $ServerEnv -Key 'SUPABASE_SERVICE_ROLE_KEY'

if (-not $url) {
  $url = Read-DotEnvValue -Path (Join-Path $ProjectRoot 'mobile\.env') -Key 'EXPO_PUBLIC_SUPABASE_URL'
}
if (-not $url -or -not $key -or $key -match 'your-service-role') {
  Write-Host 'Configurez server\.env avec SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (service role).' -ForegroundColor Yellow
  Write-Host "Puis relancez ce script, ou uploadez manuellement public\auth-callback.html vers : $BucketId/$ObjectPath"
  exit 1
}

$url = $url.TrimEnd('/')
$headers = @{
  Authorization = "Bearer $key"
  apikey = $key
}

Write-Host "Verification bucket $BucketId ..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$url/storage/v1/bucket/$BucketId" -Method Get -Headers $headers | Out-Null
} catch {
  Write-Host "Creation bucket $BucketId ..." -ForegroundColor Yellow
  $body = @{
    id = $BucketId
    name = $BucketId
    public = $true
    file_size_limit = 1048576
    allowed_mime_types = @('text/html', 'text/plain', 'application/json')
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "$url/storage/v1/bucket" -Method Post -Headers ($headers + @{ 'Content-Type' = 'application/json' }) -Body $body | Out-Null
  $patchBody = @{
    public = $true
    file_size_limit = 1048576
    allowed_mime_types = @('text/html', 'text/plain', 'application/json')
  } | ConvertTo-Json
  Invoke-RestMethod -Uri "$url/storage/v1/bucket/$BucketId" -Method Put -Headers ($headers + @{ 'Content-Type' = 'application/json' }) -Body $patchBody | Out-Null
}

$uploadUrl = "$url/storage/v1/object/$BucketId/$ObjectPath"
$bytes = [System.IO.File]::ReadAllBytes($HtmlPath)
$uploadHeaders = $headers + @{
  'Content-Type' = 'text/html'
  'x-upsert' = 'true'
}

Write-Host "Upload vers $uploadUrl ..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri $uploadUrl -Method Put -Headers $uploadHeaders -Body $bytes | Out-Null
} catch {
  Write-Host "Echec upload : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Appliquez la migration supabase/migrations/20260869_app_public_storage.sql si le bucket est bloque.' -ForegroundColor Yellow
  exit 1
}

$publicUrl = "$url/storage/v1/object/public/$BucketId/$ObjectPath"
Write-Host 'OK — page publique :' -ForegroundColor Green
Write-Host $publicUrl
Write-Host ''
Write-Host 'Ajoutez cette URL dans Supabase → Authentication → Redirect URLs' -ForegroundColor Yellow
