---
name: "exp-debian-bmc-netboot-deploy"
description: "鲲鹏服务器经 BMC 虚拟光驱全自动安装 Debian 的完整打法：引导链顺序、断链容错、诊断工具箱与全部已踩坑"
whenToUse: "当需要部署/调试 dsh-os-deploy 插件、在华为 iBMC 机器上装 Debian（netboot）、或部署卡在某阶段需要定位时使用"
metadata:
  experience: true
  scope: project
  version: 1
  created: "2026-09-23T08:30:00.000Z"
  tags: "debian, netboot, ibmc, redfish, virtual-media, debootstrap, hns3, os-deploy"
---

# Debian BMC 虚拟光驱 netboot 全自动部署

## 问题

在鲲鹏（aarch64）+ 华为 iBMC 服务器上，用 os-deploy 插件（Redfish 虚拟光驱 + HTTP 仓库）全自动安装 Debian。整个链路涉及 7 个阶段，每个阶段都有独有的坑：BMC 虚拟光驱挂载、UEFI 引导、grub HTTP-boot、netcfg、anna/debootstrap、pkgsel、首启。任何一环失败都表现为"卡住不动"，且 SOL 串口默认看不到 newt 前端，d-i 是黑盒。

## 解决方案

### 1. 引导链顺序（关键！与 iBMC 行为强相关）

```
冷复位（ForceOff→12s→On，清 NIC 死锁）
  → 等 5 分钟（POST + 磁盘 OS 起来，NIC 链路稳定）
  → VCD 挂载（此时才 connect 镜像）
  → setBootOnce(Cd) + ForceRestart（必须热重启）
```

**实证规律**（来自 8 次任务对照）：
- 热重启进 VCD = iBMC 以 GET 206 流式供数据（✓ 唯一可靠路径）
- 挂盘后断电（冷复位）= iBMC 只发 HEAD 200 校验、零数据流（✗ 机器读不到 ISO 回退磁盘）
- NIC 死锁（hns3 link-down deadlock）只有冷复位能清，热重启清不掉 → 所以冷复位必须放在挂盘**之前**
- 机器上电稳定后才 connect 镜像 → VCD 数据通道才健康

### 2. Debian 仓库准备（缺一不可）

```
repo/<distroId>/
  netboot-kernel + netboot-initrd.gz   ← 必须用 deb.debian.org 的真 netboot 资产
                                          （DVD 自带的 install.a64/initrd.gz 是 cdrom 安装器，不适用 HTTP 引导）
  pool/...                             ← DVD 解包的 .deb
  dists/trixie/{InRelease,Release,...} ← 元数据
```
- Debian 自家 grub 缺 http 模块 → **借用 openEuler/麒麟镜像的 efiboot.img**（需先注册解包任一 anaconda 系镜像）
- **InRelease 等文本元数据严禁 CRLF**（见 exp-repo-file-crlf-corruption 技能——这是曾卡死所有 Debian 任务的真根因）

### 3. 断链容错（hns3 驱动周期性 flap，up/down 各 30-90s）

下载器分两层、分别配置重试：
- **debootstrap 用 GNU wget 逐包下载** → early_command 写 `/etc/wgetrc`：`tries=100 / timeout=15 / waitretry=5`（≈33 分钟重试耐力；busybox wget 忽略它不影响别处）
- **pkgsel 用 in-target apt** → cp-watcher 往 /target 追加 `Acquire::Retries 50; Timeout 20`
- **切忌**把 Retries/Timeout 写进安装器自己的 apt conf——会卡死 anna（udeb 一个都拉不到，机制未明但两次实证）
- SSH 等待超时放到 45 分钟

### 4. 诊断工具箱（按侵入性排序）

| 手段 | 用法 | 能看到 |
|---|---|---|
| install.log | `tasks/<id>/install.log`（实时追加） | BMC 拉盘模式（HEAD=坏/GET 206=好）、netboot/udeb/.deb 拉取计数、安装器各阶段回报 |
| 心跳 | early_command 里 10s 循环 wget 上报 syslog 尾部 + LK=链路状态 | d-i 盲区状态、链路 flap 节奏（N 缺口=断）；wget 记得 `-T 8` 防挂死 |
| SOL + grub 串口 | grub.cfg 加 `serial --unit=0 --speed=115200` + `terminal_input/output serial console` | grub 菜单/报错/倒计时、内核启动、EFI stub |
| SOL 进 d-i shell | 主菜单按 `e` 跳到 Execute a shell → CR 进 ash | 完整文件系统！grep syslog、看 lists、手工修复 |
| SOL 敲对话框 | newt 前端只在按键时发增量；TAB/CR 有效，`\n` 无效；TAB TAB CR 可触发全屏重绘 | 错误对话框全文、按钮焦点 |

### 5. 关键排障对照表

| 症状 | 根因 | 处置 |
|---|---|---|
| VCD 挂载成功但机器从磁盘启动，BMC 零请求 | 热重启时机太早（机器没起完整）| 冷复位→等 5 分钟→挂盘→热重启 |
| BMC 600×HEAD 200 无 GET | 挂盘后断电破坏 VMM 会话 | 顺序改为先冷复位后挂盘 |
| netboot-kernel 拉到、initrd 没有，SOL 静默 | initrd fetch 撞断链窗，grub 无重试掉回菜单 | SOL 发 TAB+CR 重试引导 |
| 卡 preseed 后，udeb 0 个，链路却通 | 安装器 apt conf 有 Retries/Timeout | 删掉，只留 AllowInsecure/AllowUnauthenticated |
| "Failed to install the base system"，syslog 有 `sed: /target/var/lib/apt/lists/..._Release: No such file` | 仓库 InRelease 被转成 CRLF，debootstrap 的 split_inline_sig 解析 PGP 头失败 | 剥离 InRelease 的 \r（对齐 deb.debian.org 的纯 LF）|
| debootstrap 后期卡十几分钟、零请求 | .deb 下载撞断链窗且 wget 无重试配置 | /etc/wgetrc tries=100 |

### 6. 一次成功部署的时间线参考

冷复位→等5分钟→挂盘(~10s)→热重启→grub(串口可见)→netboot(~1min)→netcfg→anna 79 udeb(~30s)→分区→InRelease→**debootstrap ~415 包**→**pkgsel +35 包**→late_command→grub 安装→重启→SSH。全程约 23 分钟（含链路 flap 重试）。

## 上下文与关键细节

- 机器：taishan-1 / iBMC 192.168.2.14（Administrator）、安装 IP 192.168.2.167、服务器 192.168.2.137（:80 HTTP + :443 HTTPS，iBMC 的 VMMControl 只接受 https:// 镜像 URL）
- NIC：Hi1822 四口，驱动 **hns3**（不是 hinic），接口 enp125s0f0；内核 6.12.107 缺 2026-06 的 hns3 修复 → 周期性链路 flap 是已知内核 bug，只能容错不能根除（除非换新内核 netboot 资产）
- iBMC SOL 对 newt 前端是"半盲"的：静态主区永不重发，只有按键增量；内核 console=ttyS0 全量输出
- preseed 的 early_command 里 TS 模板 `tr '\n'` 必须写成 `tr '\\n'`（模板字面量里单个 `\n` 是真换行，会截断 debconf 单行值）
- 安装器环境没有 apt（`apt-get: not found` 是正常的——netboot initrd 本来就不带）；apt lists 由 apt-setup 的 generator 用 wget 自己放
- debootstrap `--debian-installer` 模式：目标文件已存在时 `get` 直接跳过下载（缓存语义），InRelease 由 apt-setup 预放置 → 上游文件格式错 = 静默死
- 心跳 SL 里放 `grep -v early_command`：debconf 会把 preseed 值记进 syslog，巨长一行会吃光上报预算
- SOL 长命令会传丢/重复字符（曾把 debian 传成 debiian）→ 交互时用短命令 + shell 变量 + `rename` 修正

## 标签

- debian
- netboot
- ibmc
- redfish
- virtual-media
- debootstrap
- hns3
- os-deploy

## 元数据

- scope: project
- version: 1
- created: 2026-09-23T08:30:00.000Z

> 本经验由 `experience_capture` 计算生成，由模型的 `write` 工具落盘；经 dsh-skill-filesystem 热重载后跨会话/项目继承，可被 `experience_recall` 召回。
