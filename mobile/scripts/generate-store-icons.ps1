# Régénère icon.png / adaptive-icon.png / splash-icon.png (1024×1024) pour EAS.
# Usage : powershell -ExecutionPolicy Bypass -File mobile\scripts\generate-store-icons.ps1

$root = Join-Path $PSScriptRoot ".."
$repoRoot = Join-Path $PSScriptRoot "..\.."
$npm = Join-Path $repoRoot ".tools\node\npm.cmd"
Push-Location $root
try {
  if (-not (Test-Path "node_modules\sharp")) {
    & $npm install sharp --no-save --silent 2>$null
  }
  & (Join-Path $repoRoot ".tools\node\node.exe") (Join-Path $PSScriptRoot "generate-icons.mjs")
} finally {
  Pop-Location
}
