# Ouvre le port Metro Expo (8082) au reseau local Windows.
# A lancer une fois en ADMINISTRATEUR si iPhone affiche "internet connection appears offline"
# avec exp://IP_PC:8082 (Android peut marcher sans cette regle).

param(
  [int]$Port = 8082
)

$ErrorActionPreference = 'Stop'

function Add-FirewallRuleSafe {
  param(
    [string]$DisplayName,
    [hashtable]$Params
  )
  $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Regle pare-feu deja presente : $DisplayName" -ForegroundColor Green
    return $true
  }
  try {
    New-NetFirewallRule @Params | Out-Null
    Write-Host "Regle pare-feu ajoutee : $DisplayName" -ForegroundColor Green
    return $true
  } catch {
    if ($_.Exception.Message -match 'Acc.s refus|Access is denied|5') {
      return $false
    }
    throw
  }
}

$portRule = Add-FirewallRuleSafe -DisplayName "THE LOOP Expo Metro TCP $Port" -Params @{
  DisplayName = "THE LOOP Expo Metro TCP $Port"
  Direction   = 'Inbound'
  Action      = 'Allow'
  Protocol    = 'TCP'
  LocalPort   = $Port
  Profile     = 'Any'
}

$nodePath = Join-Path (Split-Path $PSScriptRoot -Parent) ".tools\node\node.exe"
$nodeRule = $true
if (Test-Path $nodePath) {
  $nodeRule = Add-FirewallRuleSafe -DisplayName "THE LOOP Node.js Metro $Port" -Params @{
    DisplayName = "THE LOOP Node.js Metro $Port"
    Direction   = 'Inbound'
    Action      = 'Allow'
    Program     = $nodePath
    Protocol    = 'TCP'
    LocalPort   = $Port
    Profile     = 'Any'
  }
}

Write-Host ""
if ($portRule -and $nodeRule) {
  Write-Host "Pare-feu OK pour Metro (port $Port, tous profils reseau)." -ForegroundColor Green
  Write-Host "Verifiez aussi : Wi-Fi Windows = reseau Prive (pas Public)." -ForegroundColor Cyan
  Write-Host "iPhone Safari test : http://VOTRE_IP:${Port}/status" -ForegroundColor Cyan
  Write-Host "iPhone : Reglages - Expo Go - Reseau local = ON" -ForegroundColor Cyan
  exit 0
}

Write-Host "ECHEC : droits administrateur requis." -ForegroundColor Red
Write-Host ""
Write-Host "Clic droit PowerShell - Executer en tant qu administrateur, puis :" -ForegroundColor Yellow
Write-Host "  cd `"$((Split-Path $PSScriptRoot -Parent))`"" -ForegroundColor White
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\ensure-expo-firewall.ps1" -ForegroundColor Cyan
exit 1
