# Track A (Windows) — serve the existing client-side APEX app from this machine.
# Serves the REPO ROOT (index.html + js/) over HTTP. Ctrl-C to stop.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir "..\..")

# load .env (simple KEY=VALUE lines) if present
$envFile = Join-Path $ScriptDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*[^#].*=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2
    if ($k.Trim()) { [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process') }
  }
}
$Port = $env:PORT; if (-not $Port) { $Port = "8765" }
$Bind = $env:APEX_HOST; if (-not $Bind) { $Bind = "0.0.0.0" }

Write-Host "Serving APEX from: $RepoRoot"
Write-Host "  local:   http://localhost:$Port/index.html"
Write-Host "  network: http://<this-machine-ip>:$Port/index.html"
Set-Location $RepoRoot
python -m http.server $Port --bind $Bind
