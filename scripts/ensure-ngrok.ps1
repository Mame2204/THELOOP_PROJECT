# Verifie que ngrok.exe est present (Windows Defender le supprime parfois)
$MobileDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'mobile'
$NgrokExe = Join-Path $MobileDir 'node_modules\@expo\ngrok-bin-win32-x64\ngrok.exe'
$Npm = Join-Path (Split-Path $PSScriptRoot -Parent) '.tools\node\npm.cmd'

if (Test-Path $NgrokExe) {
    Write-Host 'ngrok.exe OK' -ForegroundColor Green
} else {
    Write-Host 'ngrok.exe manquant - reinstallation...' -ForegroundColor Yellow
    Set-Location $MobileDir
    & $Npm install '@expo/ngrok-bin-win32-x64@2.3.40' --no-save 2>&1 | Out-Null
    if (-not (Test-Path $NgrokExe)) {
        Write-Host 'Echec restauration ngrok.exe' -ForegroundColor Red
        Write-Host 'Ajoutez une exclusion Windows Defender pour ngrok-bin-win32-x64' -ForegroundColor Cyan
        exit 1
    }
    Write-Host 'ngrok.exe restaure.' -ForegroundColor Green
}

# Metro plante si des dossiers ngrok optionnels sont references mais absents (Windows)
$optionalNgrokBins = @(
    'ngrok-bin-darwin-arm64', 'ngrok-bin-darwin-x64', 'ngrok-bin-freebsd-ia32', 'ngrok-bin-freebsd-x64',
    'ngrok-bin-linux-arm', 'ngrok-bin-linux-arm64', 'ngrok-bin-linux-ia32', 'ngrok-bin-linux-x64',
    'ngrok-bin-sunos-x64', 'ngrok-bin-win32-ia32'
)
$expoDir = Join-Path $MobileDir 'node_modules\@expo'
foreach ($pkg in $optionalNgrokBins) {
    $dir = Join-Path $expoDir $pkg
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $pkgJson = @{ name = ('@expo/' + $pkg); version = '2.3.40' } | ConvertTo-Json -Compress
        Set-Content -Path (Join-Path $dir 'package.json') -Value $pkgJson -Encoding UTF8
    }
}

exit 0
