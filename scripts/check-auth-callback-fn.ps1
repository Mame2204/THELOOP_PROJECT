$r = Invoke-WebRequest -Uri 'https://eeyhtulpixvftvhppinz.supabase.co/functions/v1/auth-callback' -UseBasicParsing
Write-Host "Status: $($r.StatusCode)"
Write-Host "Content-Type: $($r.Headers['Content-Type'])"
Write-Host "All headers:"
$r.Headers.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
Write-Host "Snippet: $($r.Content.Substring(0, [Math]::Min(100, $r.Content.Length)))"
