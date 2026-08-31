# setup.ps1 — DSH_Plugin 一键安装（git clone 后在仓库根目录运行）
#
# 用法：
#   # 装全部（server-manager + experience）
#   powershell -ExecutionPolicy Bypass -File setup.ps1
#   # 只装某一个
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins server-manager
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins experience
#   # 指定 profile / preset id（挂载 server-manager 的 8 个工具需要 preset id）
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -Profile web -PresetId <你的preset id>
#   # 装完不重启
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -NoRestart
#
# 原理：用本地路径 `npm install <仓库内绝对路径>`，规避 npm git 子目录语法（#main::path:...）
# 在不同 npm 版本间不稳定的问题。前提：本机已 git clone 本仓库，并在仓库根目录运行本脚本。
[CmdletBinding()]
param(
  [string]$Profile = 'web',
  [string]$Plugins = 'all',
  [string]$PresetId = '',
  [string]$InventoryFile = '',
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$DSH_HOME = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$profileDir = Join-Path $DSH_HOME "profiles\$Profile"
if (-not (Test-Path $profileDir)) { throw "DSH profile dir not found: $profileDir (profile=$Profile)" }

# 包管理器：pnpm 优先（web profile 用 pnpm），否则 npm。注意两者的子命令不同。
$pm = if (Get-Command pnpm -ErrorAction SilentlyContinue) { 'pnpm' } else { 'npm' }
$pmVerb = if ($pm -eq 'pnpm') { 'add' } else { 'install' }
Write-Host "package manager: $pm ($pmVerb)  profile: $profileDir" -ForegroundColor Cyan

# 解析 -Plugins
$wanted = if ($Plugins -eq 'all') { @('server-manager', 'experience') } else { $Plugins.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
foreach ($p in $wanted) {
  if ($p -notin @('server-manager', 'experience')) { throw "unknown plugin: $p (allowed: server-manager, experience, all)" }
}

function Install-PmPkg {
  param([string]$AbsPath)
  if (-not (Test-Path $AbsPath)) { throw "package dir not found: $AbsPath" }
  Write-Host "  $pm $pmVerb `"$AbsPath`""
  Push-Location $profileDir
  try {
    if ($pm -eq 'pnpm') { & pnpm add $AbsPath } else { & npm install $AbsPath }
    if ($LASTEXITCODE -ne 0) { throw "$pm $pmVerb failed for $AbsPath (exit $LASTEXITCODE)" }
  } finally { Pop-Location }
}

# 把一个 composition 补丁文件的内容幂等并入目标 YAML（cordis.patch.yml / agent.cordis.yml）。
# 去掉注释行与空行后，若已含该 marker id 则跳过，否则追加。
function Add-PatchFromFile {
  param([string]$PatchFile, [string]$TargetFile, [string]$Marker)
  if (-not (Test-Path $PatchFile)) { Write-Warning "patch file not found, skip: $PatchFile"; return }
  $lines = Get-Content $PatchFile | Where-Object { $_ -and -not $_.TrimStart().StartsWith('#') }
  $body = ($lines -join "`r`n").TrimEnd()
  if (-not $body) { Write-Host "  patch empty (all comments), skip: $PatchFile"; return }
  $targetExists = Test-Path $TargetFile
  $content = if ($targetExists) { Get-Content $TargetFile -Raw } else { '' }
  if ($content -match [regex]::Escape("id: $Marker")) { Write-Host "  already mounted, skip: $Marker"; return }
  $rowText = $body + "`r`n"
  if ($content -match '(?ms)^\s*\[\s*\]\s*$') {
    $content = $content -replace '(?ms)\[\s*\]\s*$', $rowText
  } elseif ($content) {
    $content = $content.TrimEnd() + "`r`n" + $rowText
  } else {
    $content = $rowText
  }
  Set-Content -Path $TargetFile -Value $content -NoNewline -Encoding UTF8
  Write-Host "  mounted: $Marker -> $TargetFile"
}

function Restart-Dsh {
  param([string]$P)
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '(^|\s)dsh(\s|$)' }
  if ($procs) {
    foreach ($p in $procs) { Write-Host "  stopping node PID $($p.ProcessId)"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
  } else { Write-Host '  no running dsh process found' }
  $cmd = if ($P -eq 'web') { 'dsh web' } else { "dsh --profile $P" }
  Write-Host "  starting: $cmd"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "start `"DSH $P`" $cmd" -WindowStyle Hidden
}

# ---------------- server-manager ----------------
if ($wanted -contains 'server-manager') {
  Write-Host '[server-manager] install packages' -ForegroundColor Cyan
  Install-PmPkg (Join-Path $repoRoot 'server-manager\dsh-server-manager')
  Install-PmPkg (Join-Path $repoRoot 'server-manager\dsh-server-manager-tools')
  Write-Host '[server-manager] mount host row' -ForegroundColor Cyan
  Add-PatchFromFile -PatchFile (Join-Path $repoRoot 'server-manager\composition\host.patch.yml') -TargetFile (Join-Path $profileDir 'cordis.patch.yml') -Marker 'server-manager'
  if ($PresetId) {
    Write-Host "[server-manager] mount tools row into preset '$PresetId'" -ForegroundColor Cyan
    $presetFile = Join-Path $DSH_HOME ".agent-presets\$PresetId\agent.cordis.yml"
    if (-not (Test-Path $presetFile)) { Write-Warning "preset not found: $presetFile (skip tools; check the preset id)" }
    else { Add-PatchFromFile -PatchFile (Join-Path $repoRoot 'server-manager\composition\preset.patch.yml') -TargetFile $presetFile -Marker 'server-manager-tools' }
  } else {
    Write-Host '[server-manager] no -PresetId given, skip mounting the 8 tools (pass -PresetId <id> to enable)' -ForegroundColor Yellow
  }
  $invFile = if ($InventoryFile) { $InventoryFile } else { Join-Path $HOME 'dsh-server-inventory.json' }
  $localServers = Join-Path $repoRoot 'server-manager\servers.local.json'
  if (Test-Path $localServers) {
    Write-Host "[server-manager] seed inventory -> $invFile" -ForegroundColor Cyan
    Copy-Item $localServers $invFile -Force
    Write-Host '  note: servers.local.json is gitignored and never committed.'
  } else {
    Write-Host '[server-manager] servers.local.json not found (skip; add servers in Settings > Server Manager after restart)' -ForegroundColor Yellow
  }
}

# ---------------- experience ----------------
if ($wanted -contains 'experience') {
  Write-Host '[experience] install package' -ForegroundColor Cyan
  Install-PmPkg (Join-Path $repoRoot 'experience\dsh-skill-experience')
  Write-Host '[experience] mount host row' -ForegroundColor Cyan
  Add-PatchFromFile -PatchFile (Join-Path $repoRoot 'experience\composition\host.patch.yml') -TargetFile (Join-Path $profileDir 'cordis.patch.yml') -Marker 'skill-experience'
}

# ---------------- restart ----------------
if ($NoRestart) {
  Write-Host 'restart skipped (-NoRestart)' -ForegroundColor Yellow
} else {
  Write-Host 'restart DSH' -ForegroundColor Cyan
  Restart-Dsh -P $Profile
}

Write-Host 'Done.' -ForegroundColor Green
Write-Host '  server-manager: Settings > Server Manager (add servers there).'
Write-Host '  experience: tools experience_capture / experience_recall / experience_list; skills learn-experience / recall-experience (type / to browse).'
