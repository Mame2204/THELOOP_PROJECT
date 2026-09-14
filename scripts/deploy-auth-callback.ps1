# THE LOOP — Deploie la page de confirmation e-mail (Edge Function)
# Usage :
#   .\deploy-auth-callback.cmd          (demande un token Supabase)
#   SUPABASE_ACCESS_TOKEN=xxx node scripts/deploy-auth-callback-api.mjs

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$NodeDir = Join-Path $ProjectRoot '.tools\node'
$Node = Join-Path $NodeDir 'node.exe'
$ProjectRef = 'eeyhtulpixvftvhppinz'

$env:PATH = "$NodeDir;$env:PATH"
Set-Location $ProjectRoot

Write-Host "Deploiement Edge Function auth-callback (projet $ProjectRef)..." -ForegroundColor Cyan
& $Node (Join-Path $ProjectRoot 'scripts\deploy-auth-callback-api.mjs')
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'Lancez plutot : .\deploy-auth-callback.cmd' -ForegroundColor Yellow
  Write-Host 'Token : https://supabase.com/dashboard/account/tokens' -ForegroundColor Yellow
  exit 1
}

$url = "https://$ProjectRef.supabase.co/functions/v1/auth-callback"
Write-Host ''
Write-Host "Page active : $url" -ForegroundColor Green
Write-Host ''
Write-Host 'Supabase Authentication URL Configuration :' -ForegroundColor Yellow
Write-Host "  Site URL      : $url"
Write-Host "  Redirect URLs : $url"
Write-Host '                  theloop://**'
Write-Host '                  exp://**'
