# 重建 os-deploy typert 工作区脚手架（协议源码 + vendor 类型副本）。
# 正常情况下这些文件已提交在仓库中；仅当需要同步上游新版本时才需要运行本脚本。
# 上游: https://github.com/deepseek-ai/deepseek-harness (master)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $PSScriptRoot

$base = 'https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/typert/protocol/src'
$protoSrc = Join-Path $here 'packages\dsh-typert-protocol\src'
New-Item -ItemType Directory -Force -Path $protoSrc | Out-Null
foreach ($f in @('index.ts', 'types.ts', 'owned-value.ts', 'remote-error.ts')) {
  Invoke-WebRequest -Uri "$base/$f" -OutFile (Join-Path $protoSrc $f) -UseBasicParsing
  Write-Host "protocol/src/$f"
}
# 注意: 若上游 types.ts 重新加入 cordis Context 增强（declare module 块），
# 需手工再次移除 —— 见 types.ts 尾部注释（typert-generator 会因 surface
# 要求 protocol 也导出 ./typert，而构建时并不需要为它生成工件）。

$src = Join-Path $here 'packages\dsh-os-deploy\node_modules'
$jobs = @(
  @{ src = "$src\@deepseek-ai\cordis";        dst = "$here\vendor\cordis";                  dirs = @('lib') },
  @{ src = "$src\@deepseek-ai\cosmokit";      dst = "$here\vendor\cosmokit";                dirs = @('lib') },
  @{ src = "$src\@standard-schema\spec";      dst = "$here\vendor\standard-schema\spec";    dirs = @('dist') }
)
foreach ($j in $jobs) {
  New-Item -ItemType Directory -Force -Path $j.dst | Out-Null
  Copy-Item "$($j.src)\package.json" "$($j.dst)\package.json" -Force
  foreach ($d in $j.dirs) { Copy-Item "$($j.src)\$d" "$($j.dst)\$d" -Recurse -Force }
  Write-Host "vendor: $($j.dst)"
}
Write-Host 'done.'
