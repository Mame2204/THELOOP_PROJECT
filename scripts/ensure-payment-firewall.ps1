# Ouvre le port 8787 (serveur paiement / API partenaire) au réseau local Windows.
# À lancer une fois en administrateur si le téléphone ne joint pas http://IP_PC:8787

$ruleName = "THE LOOP Payment Server TCP 8787"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Regle pare-feu deja presente : $ruleName" -ForegroundColor Green
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 8787 `
  -Profile Private, Domain | Out-Null

Write-Host "Pare-feu : port 8787 autorise (Profils Private/Domain)." -ForegroundColor Green
Write-Host "Testez depuis le telephone : http://VOTRE_IP:8787/health" -ForegroundColor Cyan
