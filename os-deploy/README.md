# dsh-os-deploy — OS 自动化部署插件

面向鲲鹏（aarch64）服务器的 OS 自动化部署 DSH Cordis 插件：

- **支持三种 OS**：openEuler / 麒麟 V10 / Debian（aarch64）
- **部署方式**：BMC 虚拟光驱（Redfish VMM）+ HTTP 仓库，目标机无需 PXE/DHCP
- **任务管理**：单机/多机批量部署，同一 BMC 排队串行，实时进度+日志
- **安装组件**：最小化 / 开发工具（GCC 等）/ 常用工具，按发行版可选
- **IP 配置**：已有 OS 环境保持相同 IP，新装环境支持自定义 root 密码 / IP / 网关 / 掩码

## 安装

```powershell
# 在仓库根目录
powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins os-deploy
```

安装后重启 DSH，浏览器「设置 → OS 部署」出现。

## 服务按需启动（默认不启动）

为不影响 DSH 启动速度，部署服务（HTTP 软件源 + 任务队列）**默认不启动**：

- 面板顶部有服务控制条：状态灯 + 「启动 / 停止 / 重启」按钮
- 点击「启动」后才开启 HTTP 仓库（`:80` HTTP + `:443` HTTPS + UDP `:514` syslog 收集）并恢复队列；停止时会取消排队任务、终止运行中任务
- 服务未启动时无法创建安装任务（按钮禁用并有提示）
- DSH 重启后服务回到停止状态，需再次手动启动

## 其他环境部署准备（重要）

在新机器上使用本插件前，确认以下条件：

### 端口与防火墙

| 端口 | 用途 | 说明 |
|---|---|---|
| TCP 80 | HTTP 仓库/preseed/安装器回报 | 安装器与 grub 经此拉取内核/包/配置 |
| TCP 443 | HTTPS 虚拟光驱镜像 | 华为 iBMC 的 VMMControl **只接受 https:// 镜像 URL**（证书为内置自签）|
| UDP 514 | 安装器 syslog 实时收集 | 可选，失败仅降级不影响安装 |

- Windows 防火墙需放行以上入站（首次绑定 node.exe 时系统通常会弹窗，勾选允许即可）
- 绑定 80/443 需要**管理员权限**运行 DSH，且确保端口未被 IIS/其他服务占用

### 网络可达性

- 部署服务器（运行 DSH 的机器）与目标机 BMC、目标机安装 IP 三者**同网段或可路由**
- 目标机安装期使用静态 IP（零 DHCP 依赖），需提前规划好空闲 IP

### Debian 镜像仓库的特殊要求

Debian 走 netboot 安装器，对仓库有额外要求（openEuler/麒麟无此要求）：

1. **真 netboot 资产**：仓库根需放 `netboot-kernel` + `netboot-initrd.gz`（取自
   `deb.debian.org/debian/dists/<suite>/main/installer-arm64/current/images/netboot/netboot.tar.gz`
   中的 linux/initrd.gz）。DVD 自带的 `install.a64` 是 cdrom 安装器，**不能**用于 HTTP 引导，
   且需确保 pool 里有匹配版本的内核 udeb。
2. **借用 anaconda 系镜像的引导器**：Debian 自家 grub 缺 http 模块——需先注册并解包任一
   openEuler 或麒麟镜像（借用其 efiboot.img）。
3. **元数据行尾必须是 LF**：`dists/*/InRelease` 等文本元数据严禁 CRLF（Windows 工具同步时会
   静默转换）。CRLF 会让 debootstrap 的 PGP 头解析静默失败，表现为
   `sed: /target/var/lib/apt/lists/..._Release: No such file or directory` →
   "Failed to install the base system"。同步后建议审计：
   ```powershell
   $b=[IO.File]::ReadAllBytes('<InRelease>'); ($b|?{$_ -eq 13}).Count   # 应为 0
   ```
   （详见仓库 `.dsh/skills/exp-repo-file-crlf-corruption/SKILL.md`）
4. **不签名仓库**：插件自动为安装器和目标机写入 `[trusted=yes]`/`AllowInsecureRepositories` 配置，
   无需处理 apt 签名。

### 目标机 BMC

- 当前主要适配华为 iBMC（TaiShan，Redfish Basic Auth + VMMControl + 一次性 CD 引导）
- BMC 需能访问部署服务器的 443 端口（虚拟光驱镜像由 BMC 主动拉取）

## 使用流程

0. **启动服务**：在面板顶部点击「启动」（部署服务默认不启动）
1. **注册镜像**：在「镜像管理」页注册本地 ISO 文件（指定厂家 openEuler/麒麟/Debian）
2. **解包镜像**：点击「解包」提取 ISO 内容为 HTTP 仓库
3. **创建任务**：在「创建安装任务」页选择镜像 → 选组件 → 填设备信息（或从服务器管理选）→ 填 OS 配置
4. **监控进度**：在「安装任务」页实时查看进度、日志，可取消/删除

## 技术架构

```
浏览器 UI (client.ts) ←→ @Remote → Host Service (index.ts) → DeployRunner (engine.ts)
                                                    ↓
                                        BMC Redfish (虚拟光驱/引导/电源)
                                        HTTP Server :80/:443 (软件包/报告/ISO)
                                        Kickstart/Preseed 生成器
```

- **BMC**：华为 iBMC 兼容（Redfish Basic Auth，VMMControl，一次性 CD 引导）
- **安装器**：anaconda（openEuler/麒麟，kickstart）/ debian-installer（Debian，preseed）
- **网络**：目标机安装期使用静态 IP（内核参数 `ip=`/`ifname=` 或 preseed `netcfg/`），零 DHCP 依赖
- **组件选择**：`@core` / `@development` / `openssh-server` / `build-essential` 等
- **进度上报**：目标机 `%pre` 阶段通过 HTTP 回调（`/report?stage=...`）实时推送

## 排队机制

同一 BMC IP 的安装任务自动排队串行执行，不同 BMC 可并行。任务状态：`queued → running → success/failed/cancelled`。

## 从服务器管理选择设备

如果同时安装了 `server-manager` 插件，OS 部署页可从已纳管的服务器列表中选择目标设备（自动填充 SSH/BMC 地址）。

## 安全

- 公开包不内置任何服务器清单或凭据
- 所有敏感信息（BMC 密码、root 密码）在浏览器 UI 手动输入，持久化到本地 JSON
- 安装任务数据存储在 `dsh-os-deploy-state.json`

## 构建（改源码后）

```bash
cd os-deploy/packages/dsh-os-deploy
npm install --cache <本地缓存目录>
npm run bundle
```

构建说明：

- 包位于 `os-deploy/packages/dsh-os-deploy`（typert-generator 要求工作区包必须
  实际位于 `<workspace>/packages/` 下）
- `os-deploy/tsconfig.host.json` + `tsconfig.client.json`：typert 工作区聚合配置
- `os-deploy/packages/dsh-typert-protocol`：`@deepseek-ai/dsh-typert-protocol`
  源码副本（自上游 deepseek-harness 下载），仅用于构建期类型分析，使
  `@Remote` / `TypertRemoteService` 符号归属工作区包，从而生成
  `lib/typert.host.js`（TYPERT 清单）与 `lib/typert.remote-client.js`
- `os-deploy/vendor/`：cordis / cosmokit / @standard-schema/spec 的副本，
  位于所有注册之外，供协议源码解析导入（模仿上游 vendor 布局）
- 构建产物 `lib/typert.host.js` 由 DSH 的 typert-loader 经 package.json
  的 `./typert` 导出加载，`remote.osDeploy` 由此可用

## 已知限制

- BMC Redfish 兼容性主要测试于华为 iBMC（TaiShan 200K），其他厂商 BMC 未充分测试
- Debian 仓库不签名由插件自动 trusted=yes 处理，无需手动处理签名
- ISO 解包依赖 Windows bsdtar（tar 命令），中文文件名的 manual/doc 目录可能报错但不影响核心内容
- Hi1822 网卡（hns3 驱动）在内核 6.12.107 上有周期性链路 flapping（已知内核 bug）：插件已内置
  wget/apt 双层重试容错（安装全程可穿过断链窗口），但极端情况下 grub 的 netboot 拉取仍可能
  需要一次 SOL 手动重试（见下表）

## 排障速查

| 症状 | 根因 | 处置 |
|---|---|---|
| 虚拟光驱挂载超时 | BMC 无法访问服务器 443 / 端口被占 / 非管理员 | 检查防火墙、端口、权限 |
| 机器从磁盘启动（BMC 零拉盘请求）| 上电后立刻热重启，iBMC VMM 会话未就绪 | 插件已内置冷复位+等待；若复现检查流程日志顺序 |
| 卡 "Install the base system"（Debian）| 仓库元数据 CRLF 污染 | 见「其他环境部署准备」第 3 条 |
| 链路 flap 期下载慢/卡 | hns3 内核 bug | 插件已内置重试；等待即可（最长 45 分钟超时）|
| 看不到安装器在干什么 | d-i 前端在图形控制台 | 任务日志有心跳/syslog 回报；BMC SOL + 串口可见 grub/内核 |
