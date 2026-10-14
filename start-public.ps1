# Starts a free Cloudflare HTTPS tunnel + the upload server, so the QR code
# works from ANY network (mobile data, other Wi-Fi). Photos still save on this PC.
Set-Location $PSScriptRoot

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
  $local = Join-Path $env:LOCALAPPDATA "cloudflared\cloudflared.exe"
  if (Test-Path $local) { $cf = Get-Command $local }
}
if (-not $cf) {
  Write-Host ""
  Write-Host "cloudflared is not installed. Install it once, then run this again:" -ForegroundColor Yellow
  Write-Host "  winget install --id Cloudflare.cloudflared"
  Write-Host "or download cloudflared-windows-amd64.msi from"
  Write-Host "  https://github.com/cloudflare/cloudflared/releases/latest"
  Write-Host "(close and reopen this window after installing)"
  exit 1
}

if (-not (Test-Path node_modules)) {
  Write-Host "Installing dependencies, please wait..."
  npm install --omit=dev
}

$port = if ($env:PORT) { $env:PORT } else { 3000 }
$log = Join-Path $env:TEMP "photo-upload-tunnel.log"
Remove-Item $log -ErrorAction SilentlyContinue

Write-Host "Starting secure tunnel..."
$tunnel = Start-Process -FilePath $cf.Source `
  -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:$port" `
  -RedirectStandardError $log -WindowStyle Hidden -PassThru

# Wait (up to 60 s) for cloudflared to print its public https://....trycloudflare.com address.
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if ($tunnel.HasExited) { break }
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}

if (-not $url) {
  Write-Host "Could not start the tunnel. Check your internet connection. Log: $log" -ForegroundColor Red
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
  exit 1
}

Write-Host "Public link: $url" -ForegroundColor Green
$env:PUBLIC_URL = $url
try {
  node server.js
} finally {
  # Closing the server also closes the public link.
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force }
}
