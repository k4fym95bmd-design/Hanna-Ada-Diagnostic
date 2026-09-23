param(
  [string]$AllowedOrigin = "http://localhost:3000",
  [string]$BridgeHost = "127.0.0.1",
  [int]$AppPort = 3000,
  [int]$BridgePort = 8765,
  [string]$TlsCert = "",
  [string]$TlsKey = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js nie jest zainstalowany albo nie ma go w PATH."
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 20) {
  throw "Wymagany Node.js 20 lub nowszy. Wykryto: $(node -v)"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Instaluję zależności npm..."
  npm install
}

Write-Host "Uruchamiam lokalny test gotowości..."
node gateway/windows-gateway-doctor.mjs
if ($LASTEXITCODE -ne 0) {
  throw "Gateway doctor wykrył brak wymaganej gotowości."
}

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''

$env:PORT = "$AppPort"
$server = Start-Process powershell -PassThru -ArgumentList "-NoExit","-Command","Set-Location '$RepoRoot'; `$env:PORT='$AppPort'; node server.mjs"

$env:HAA_BRIDGE_TOKEN = $token
$env:HAA_BRIDGE_ORIGIN = $AllowedOrigin
$env:HAA_BRIDGE_HOST = $BridgeHost
$env:HAA_BRIDGE_PORT = "$BridgePort"

if ($TlsCert -and $TlsKey) {
  $env:HAA_BRIDGE_TLS_CERT = (Resolve-Path $TlsCert).Path
  $env:HAA_BRIDGE_TLS_KEY = (Resolve-Path $TlsKey).Path
} elseif ($BridgeHost -notin @("127.0.0.1","localhost","::1")) {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  throw "Dostęp LAN wymaga certyfikatu TLS. Podaj -TlsCert i -TlsKey albo użyj 127.0.0.1."
}

# Child processes inherit environment variables. Keep the token OUT of command-line arguments.
$bridgeCommand = "Set-Location '$RepoRoot'; node gateway/windows-cable-bridge.mjs"
$bridge = Start-Process powershell -PassThru -ArgumentList "-NoExit","-Command",$bridgeCommand

# Drop sensitive bridge environment from the launcher after the child inherited it.
Remove-Item Env:HAA_BRIDGE_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:HAA_BRIDGE_ORIGIN -ErrorAction SilentlyContinue
Remove-Item Env:HAA_BRIDGE_HOST -ErrorAction SilentlyContinue
Remove-Item Env:HAA_BRIDGE_PORT -ErrorAction SilentlyContinue
Remove-Item Env:HAA_BRIDGE_TLS_CERT -ErrorAction SilentlyContinue
Remove-Item Env:HAA_BRIDGE_TLS_KEY -ErrorAction SilentlyContinue

Write-Host "Sprawdzam health aplikacji..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$AppPort/health" -Method Get -TimeoutSec 2
    if ($health.ok -eq $true) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 250
}
if (-not $ready) {
  Stop-Process -Id $server.Id,$bridge.Id -Force -ErrorAction SilentlyContinue
  throw "Aplikacja nie przeszła lokalnego health-checku."
}

if ($BridgeHost -in @("127.0.0.1","localhost","::1") -and -not $env:HAA_BRIDGE_TLS_CERT) {
  Write-Host "Sprawdzam capabilities mostu..."
  $headers = @{ Authorization = "Bearer $token"; Origin = $AllowedOrigin }
  $bridgeReady = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $cap = Invoke-RestMethod -Uri "http://127.0.0.1:$BridgePort/v1/capabilities" -Headers $headers -Method Get -TimeoutSec 2
      if ($cap.readOnly -eq $true -and $cap.arbitraryTx -eq $false -and $cap.atomicSnapshot -eq $true) { $bridgeReady = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $bridgeReady) {
    Stop-Process -Id $server.Id,$bridge.Id -Force -ErrorAction SilentlyContinue
    throw "Most nie przeszedł lokalnego capability-checku."
  }
}

Write-Host ""
Write-Host "Hanna & Ada uruchomione."
Write-Host "App: http://localhost:$AppPort"
Write-Host ("Bridge: {0}:{1}" -f $BridgeHost,$BridgePort)
Write-Host "Allowed Origin: $AllowedOrigin"
Write-Host "Token mostu:"
Write-Host $token
Write-Host ""
Write-Host "Token nie jest zapisywany do pliku. Wklej go do pola Token w aplikacji."
Write-Host "PID app: $($server.Id) | PID bridge: $($bridge.Id)"
Start-Process "http://localhost:$AppPort"
