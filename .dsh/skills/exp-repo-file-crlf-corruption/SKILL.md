---
name: "exp-repo-file-crlf-corruption"
description: "Windows 侧同步/解包 Linux 仓库元数据时文本文件被静默转成 CRLF，导致下游解析器精确匹配失败——排查方法与防御"
whenToUse: "当 Linux 工具链在 Windows 上准备的仓库/配置/元数据文件上出现'文件存在但解析说没有'、签名验证失败、或逐行精确比较不命中时使用"
metadata:
  experience: true
  scope: project
  version: 1
  created: "2026-09-23T08:30:00.000Z"
  tags: "crlf, line-endings, windows, sync, apt, debootstrap, root-cause"
---

# 仓库文件 CRLF 污染：最隐蔽的一类"文件存在但解析失败"

## 问题

在 Windows 上同步/解包一个 Linux 软件仓库（ISO 解包、robocopy、PowerShell 文本处理等），个别文本元数据文件被悄悄转换成 CRLF 行尾。下游 Linux 工具用**逐行精确字符串比较**或**签名验证**解析时静默失败——文件明明存在、大小看起来正常、肉眼内容完全一样，但程序就是解析不出来。这类故障极难定位：没有任何报错指向行尾。

实例：Debian 仓库的 `InRelease`（PGP 签名的 Release 索引）在 Windows 侧同步时 PGP 头部被转为 CRLF。debootstrap 的 `split_inline_sig` 用 `[ "$line" = "-----BEGIN PGP SIGNED MESSAGE-----" ]` 找头（`read -r` 保留 `\r`）→ 永远不匹配 → 状态机停在 pre-begin → `_Release` 文件永远不生成 → 下游 `sed: ..._Release: No such file or directory` → 安装死在 debootstrap。**同一根因连续弄死了 6+ 次部署任务**，期间被误判为网络、NIC 驱动、apt 配置等好几个别的方向。

## 解决方案

### 快速判定（PowerShell，秒级）

```powershell
$b=[IO.File]::ReadAllBytes('<file>'); ($b|?{$_ -eq 13}).Count   # CR(0x0D) 计数
# 对比上游原版（curl 下载一份），CR 数应一致；上游为 0 而本地 >0 = 被污染
```

### 修复（剥离 \r，恢复原始字节）

```powershell
$f='<file>'; $b=[IO.File]::ReadAllBytes($f)
$nb=New-Object System.Collections.Generic.List[byte]; foreach($x in $b){if($x -ne 13){$nb.Add($x)}}
[IO.File]::WriteAllBytes($f,$nb.ToArray())
```

### 防御

1. **同步/解包仓库永远走二进制安全路径**：tar/7z 解包、robocopy /B（或干脆避免经过任何"文本模式"读写）；PowerShell 的 `Set-Content`/`Get-Content|Set-Content` 默认会动行尾——仓库元数据严禁经过它们
2. **同步后做 CR 审计**：对 dists/、conf/ 等纯文本目录批量扫描 CR 字节数（gz/xz 等压缩文件免疫，可跳过）
3. PGP 签名块（armor base64）中合法字符集不含 `\r`——对含签名块的文件，任何 CR 都是污染，可放心全剥
4. 排查此类问题时优先找**上游原版做字节级 diff**，不要相信肉眼看内容

## 上下文与关键细节

- 教训成本：本例中 CRLF 只污染了 8 个字节（21048→21040），却让 `sed` 报"文件不存在"（因为生成该文件的上游解析从未执行）——报错位置与根因相隔两层
- "文件大小正常 + 内容肉眼一致 + 程序解析失败"三连 → 第一反应就该查行尾和隐藏字节
- gzip/xz 压缩文件（Packages.gz 等）对行尾免疫；裸文本（InRelease、Release、各类 .list/.conf）是重灾区
- 验证修复：剥离后与上游原版逐字节对比，CR=0 且大小差值 == 剥离数

## 标签

- crlf
- line-endings
- windows
- sync
- apt
- debootstrap
- root-cause

## 元数据

- scope: project
- version: 1
- created: 2026-09-23T08:30:00.000Z

> 本经验由 `experience_capture` 计算生成，由模型的 `write` 工具落盘；经 dsh-skill-filesystem 热重载后跨会话/项目继承，可被 `experience_recall` 召回。
