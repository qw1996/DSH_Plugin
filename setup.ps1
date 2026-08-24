# setup.ps1 -- one-click install/mount/seed/restart for dsh-server-manager
# Usage:
#   powershell -ExecutionPolicy Bypass -File setup.ps1
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Profile web -PresetId standard -InventoryFile C:\path\dsh-server-inventory.json
[CmdletBinding()]
param(
  [string]$Profile = 'web',
  [string]$PresetId = '',
  [string]$InventoryFile = '',
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$DSH_HOME = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileDir = Join-Path $DSH_HOME "profiles\$Profile"
if (-not (Test-Path $profileDir)) { throw "DSH profile dir not found: $profileDir" }
$pm = if (Get-Command pnpm -ErrorAction SilentlyContinue) { 'pnpm' } else { 'npm' }

function Add-PatchRow {
  param([string]$File, [string]$Marker, [string]$Row)
  if (-not (Test-Path $File)) { Write-Warning "file not found, skip: $File"; return }
  $content = Get-Content $File -Raw
  if ($content -match [regex]::Escape("id: $Marker")) {
    Write-Host "  already mounted, skip: $Marker"
    return
  }
  $rowText = $Row.TrimEnd() + "`r`n"
  if ($content -match '(?ms)^\s*\[\s*\]\s*$') {
    $content = $content -replace '(?ms)\[\s*\]\s*$', $rowText
  } else {
    $content = $content.TrimEnd() + "`r`n" + $rowText
  }
  Set-Content -Path $File -Value $content -NoNewline -Encoding UTF8
  Write-Host "  mounted: $Marker"
}

function Restart-Dsh {
  param([string]$Profile)
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '(^|\s)dsh(\s|$)' }
  if ($procs) {
    foreach ($p in $procs) {
      Write-Host "  stopping process PID $($p.ProcessId)"
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  }
  $cmd = if ($Profile -eq 'web') { 'dsh web' } else { "dsh --profile $Profile" }
  Write-Host "  starting: $cmd"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "start `"DSH $Profile`" $cmd" -WindowStyle Hidden
}

Write-Host "[1/5] install packages into $profileDir" -ForegroundColor Cyan
Push-Location $profileDir
try {
  & $pm add 'github:qw1996/DSH_Plugin' 'github:qw1996/DSH_Plugin#main::path:server-manager/dsh-server-manager-tools'
  if ($LASTEXITCODE -ne 0) { throw "$pm add failed" }
} finally { Pop-Location }

Write-Host '[2/5] mount host row into cordis.patch.yml' -ForegroundColor Cyan
Add-PatchRow -File (Join-Path $profileDir 'cordis.patch.yml') -Marker 'server-manager' -Row @"
- insert:
    - id: server-manager
      name: '@qinwei/dsh-server-manager'
"@

if ($PresetId) {
  Write-Host "[3/5] mount tools row into agent preset '$PresetId'" -ForegroundColor Cyan
  $presetFile = Join-Path $DSH_HOME ".agent-presets\$PresetId\agent.cordis.yml"
  if (-not (Test-Path $presetFile)) {
    Write-Warning "preset not found: $presetFile (skip tools; check the preset id)"
  } else {
    Add-PatchRow -File $presetFile -Marker 'server-manager-tools' -Row @"
- insert:
    - id: server-manager-tools
      name: '@qinwei/dsh-server-manager-tools'
"@
  }
} else {
  Write-Host '[3/5] no -PresetId given, skip mounting the 8 tools (pass -PresetId <id> to enable)' -ForegroundColor Yellow
}

$invFile = if ($InventoryFile) { $InventoryFile } else { Join-Path $HOME 'dsh-server-inventory.json' }
$localServers = Join-Path $PSScriptRoot 'servers.local.json'
if (Test-Path $localServers) {
  Write-Host "[4/5] seed inventory from servers.local.json -> $invFile" -ForegroundColor Cyan
  Copy-Item $localServers $invFile -Force
  Write-Host '  note: servers.local.json is gitignored and never committed to GitHub.'
} else {
  Write-Host '[4/5] servers.local.json not found (skip; add servers in Settings > Server Manager after restart)' -ForegroundColor Yellow
}

if ($NoRestart) {
  Write-Host '[5/5] restart skipped (-NoRestart)' -ForegroundColor Yellow
} else {
  Write-Host "[5/5] restart DSH" -ForegroundColor Cyan
  Restart-Dsh -Profile $Profile
}

Write-Host 'Done. Open DSH > Settings > Server Manager to verify the dashboard.' -ForegroundColor Green
