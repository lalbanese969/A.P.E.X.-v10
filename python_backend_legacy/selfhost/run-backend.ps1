# Track B (Windows) — run the A.P.E.X. Python backend (stdlib only, no pip installs).
# Loads settings/keys from .env in this folder. Ctrl-C to stop.

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Resolve-Path (Join-Path $ScriptDir "..")   # python_backend_legacy\

# load .env (simple KEY=VALUE lines) if present
$envFile = Join-Path $ScriptDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    if ($k.Trim()) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process') }
  }
} else {
  Write-Host "note: no .env found in $ScriptDir - running with defaults (no password, no cloud keys)."
}

Set-Location $BackendDir
$portMsg = $env:PORT; if (-not $portMsg) { $portMsg = "8765" }
Write-Host "Starting A.P.E.X. backend from: $BackendDir  (port $portMsg)"
if ($env:APEX_ACCESS_PASSWORD) { Write-Host "  access password: ON" }
else { Write-Host "  access password: OFF (set APEX_ACCESS_PASSWORD before exposing!)" }
python -m backend.server
