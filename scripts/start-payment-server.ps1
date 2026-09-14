param(
  [switch]$InstallOnly
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$NodeDir = Join-Path $Root ".tools\node"
$Npm = Join-Path $NodeDir "npm.cmd"
$ServerDir = Join-Path $Root "server"

if (-not (Test-Path $Npm)) {
  Write-Error "Node embarqué introuvable : $Npm"
}

# tsx / scripts npm appellent "node" — il doit être dans le PATH de la session
$env:PATH = "$NodeDir;$env:PATH"

Push-Location $ServerDir
try {
  if ($InstallOnly -or -not (Test-Path "node_modules")) {
    Write-Host "Installation des dépendances serveur paiement…"
    & $Npm install
    if ($InstallOnly) { return }
  }

  if (-not (Test-Path ".env")) {
    Write-Warning "Copiez server/.env.example vers server/.env et renseignez Djomy + Supabase service role."
  }

  $port = 8787
  $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($inUse) {
    Write-Host "Serveur deja actif sur le port $port." -ForegroundColor Green
    Write-Host "Health : http://127.0.0.1:$port/health" -ForegroundColor DarkGray
    return
  }

  Write-Host "Demarrage du serveur paiement Djomy (port $port)…"
  & $Npm run dev
}
finally {
  Pop-Location
}
