# THE LOOP — Demarrer l'app Expo (mobile)
# Usage : powershell -ExecutionPolicy Bypass -File scripts\start-mobile.ps1
# Tunnel : powershell -ExecutionPolicy Bypass -File scripts\start-mobile.ps1 -Tunnel
# LAN    : powershell -ExecutionPolicy Bypass -File scripts\start-mobile.ps1 -Lan

param(
    [switch]$Tunnel,
    [switch]$Lan,
    [switch]$InstallOnly,
    [switch]$Clear
)

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$NodeDir = Join-Path $ProjectRoot ".tools\node"
$Npm = Join-Path $NodeDir "npm.cmd"
$MobileDir = Join-Path $ProjectRoot "mobile"

if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    Write-Host "ERREUR: node.exe introuvable dans .tools\node\" -ForegroundColor Red
    Write-Host "Installez Node.js depuis https://nodejs.org ou utilisez le dossier .tools du projet."
    pause
    exit 1
}

$env:PATH = "$NodeDir;$env:PATH"
$Npx = Join-Path $NodeDir "npx.cmd"

function Get-NextFreePort {
    param([int]$Start = 8082, [int]$End = 8095)
    for ($port = $Start; $port -le $End; $port++) {
        $inUse = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $inUse) { return $port }
    }
    return $Start
}

function Test-ExpoLoggedIn {
    $whoami = & $Npx expo whoami 2>&1 | Out-String
    $whoami = $whoami.Trim()
    if ($whoami -match 'Not logged in|CommandError|error:|Error:') { return $false }
    return ($whoami -match '^[\w.-]+$')
}

function Show-ExpoLoginHelp {
    Write-Host ""
    Write-Host "=== Connexion Expo requise pour le tunnel ===" -ForegroundColor Yellow
    Write-Host "Option 1 : .\mobile-login.cmd (email + mot de passe)" -ForegroundColor White
    Write-Host "Option 2 : .\mobile-token-login.cmd (token https://expo.dev/settings/access-tokens)" -ForegroundColor White
    Write-Host "Option 3 : `$env:EXPO_TOKEN='votre_token'; .\mobile-tunnel.cmd" -ForegroundColor White
    Write-Host ""
    Write-Host "Inscrit via Google/GitHub ? Definissez un mot de passe sur expo.dev d'abord." -ForegroundColor Cyan
    Write-Host "Alternative sans compte : .\mobile-lan.cmd (meme Wi-Fi PC + telephone)" -ForegroundColor Cyan
    Write-Host ""
}

function Invoke-ExpoLogin {
    Show-ExpoLoginHelp
    if (-not [Environment]::UserInteractive) {
        Write-Host "Mode non interactif : lancez .\mobile-login.cmd ou .\mobile-token-login.cmd d'abord." -ForegroundColor Red
        return $false
    }
    & $Npx expo login
    if (-not (Test-ExpoLoggedIn)) { return $false }
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Path (Join-Path $MobileDir "node_modules")) -or $InstallOnly) {
    Write-Host "Installation des dependances mobile..." -ForegroundColor Yellow
    Set-Location $MobileDir
    & $Npm install
    if ($LASTEXITCODE -ne 0) { pause; exit $LASTEXITCODE }
    if ($InstallOnly) { exit 0 }
} else {
    $pkgPath = Join-Path $MobileDir "package.json"
    $lockPath = Join-Path $MobileDir "package-lock.json"
    $nmPath = Join-Path $MobileDir "node_modules"
    $pkgTime = (Get-Item $pkgPath).LastWriteTimeUtc
    $lockTime = if (Test-Path $lockPath) { (Get-Item $lockPath).LastWriteTimeUtc } else { $pkgTime }
    $nmTime = (Get-Item $nmPath).LastWriteTimeUtc
    if ($pkgTime -gt $nmTime -or $lockTime -gt $nmTime) {
        Write-Host "Mise a jour des dependances mobile (package.json modifie)..." -ForegroundColor Yellow
        Set-Location $MobileDir
        & $Npm install
        if ($LASTEXITCODE -ne 0) { pause; exit $LASTEXITCODE }
    }
}

Set-Location $MobileDir
$Port = Get-NextFreePort

# App mobile native uniquement — evite le bundler web (react-native-web) et les erreurs vscode-file://
$env:EXPO_NO_WEB_SETUP = '1'

& (Join-Path $ProjectRoot "scripts\ensure-ngrok.ps1") | Out-Null

if ($Tunnel -and -not (Test-ExpoLoggedIn)) {
    if (-not (Invoke-ExpoLogin)) {
        Write-Host ""
        Write-Host "Tunnel impossible sans compte Expo." -ForegroundColor Red
        Write-Host "Alternative : .\mobile-lan.cmd (telephone et PC sur le MEME Wi-Fi)" -ForegroundColor Cyan
        pause
        exit 1
    }
}
function Get-LanIPv4 {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notmatch '^127\.' -and
      $_.IPAddress -notmatch '^169\.254\.' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object -Property @{
      Expression = {
        if ($_.IPAddress -match '^192\.168\.') { 0 }
        elseif ($_.IPAddress -match '^10\.') { 1 }
        else { 2 }
      }
    }, InterfaceMetric

  if ($candidates) { return $candidates[0].IPAddress }
  return '127.0.0.1'
}

function Update-MobileDevEnv {
  param(
    [string]$IpAddress,
    [int]$Port
  )
  $envPath = Join-Path $MobileDir ".env"
  if (-not (Test-Path $envPath)) { return }
  $backendUrl = "http://${IpAddress}:8787"
  $devAuthRedirect = "exp://${IpAddress}:${Port}/--/auth/callback"
  $content = Get-Content $envPath -Raw
  if ($content -match 'EXPO_PUBLIC_PAYMENT_API_URL=') {
    $content = $content -replace 'EXPO_PUBLIC_PAYMENT_API_URL=.*', "EXPO_PUBLIC_PAYMENT_API_URL=$backendUrl"
  } else {
    $content += "`nEXPO_PUBLIC_PAYMENT_API_URL=$backendUrl`n"
  }
  if ($content -match 'EXPO_PUBLIC_BACKEND_API_URL=') {
    $content = $content -replace 'EXPO_PUBLIC_BACKEND_API_URL=.*', "EXPO_PUBLIC_BACKEND_API_URL=$backendUrl"
  }
  # Fallback LAN si hostUri tunnel indisponible au moment du signUp (test Expo Go)
  if ($content -match 'EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL=') {
    $content = $content -replace 'EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL=.*', "EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL=$devAuthRedirect"
  } else {
    $content += "`nEXPO_PUBLIC_DEV_AUTH_REDIRECT_URL=$devAuthRedirect`n"
  }
  # Ne pas ecraser avec theloop:// — prod via eas.json uniquement
  Set-Content -Path $envPath -Value ($content.TrimEnd() + "`n") -NoNewline
}

$LanIp = Get-LanIPv4
Update-MobileDevEnv -IpAddress $LanIp -Port $Port

Write-Host ""
Write-Host "=== THE LOOP - Expo (port $Port) ===" -ForegroundColor Cyan
Write-Host "Scannez le QR code avec Expo Go sur votre telephone." -ForegroundColor Yellow

if ($Tunnel) {
    Write-Host "Mode tunnel" -ForegroundColor DarkGray
    Write-Host ""
    $tunnelArgs = @('start', '--tunnel', '--port', "$Port")
    if ($Clear) { $tunnelArgs += '--clear' }
    & $Npx expo @tunnelArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Tunnel indisponible - bascule LAN (meme Wi-Fi PC + telephone)..." -ForegroundColor Yellow
        Write-Host ""
        $env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanIp
        $lanArgs = @('start', '--lan', '--port', "$Port")
        if ($Clear) { $lanArgs += '--clear' }
        & $Npx expo @lanArgs
    }
} elseif ($Lan) {
    Write-Host "Mode LAN" -ForegroundColor DarkGray
    Write-Host ""
    $env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanIp
    $lanArgs = @('start', '--lan', '--port', "$Port")
    if ($Clear) { $lanArgs += '--clear' }
    & $Npx expo @lanArgs
} else {
    Write-Host ""
    if ($Clear) {
        & $Npx expo start --port $Port --clear
    } else {
        & $Npx expo start --port $Port
    }
}
