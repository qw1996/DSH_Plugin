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
- 点击「启动」后才开启 `:8080` HTTP 仓库并恢复队列；停止时会取消排队任务、终止运行中任务
- 服务未启动时无法创建安装任务（按钮禁用并有提示）
- DSH 重启后服务回到停止状态，需再次手动启动

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
                                        HTTP Server :8080 (软件包/报告)
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
- Debian 安装需要手动处理镜像签名问题（apt [trusted=yes]）
- ISO 解包依赖 Windows bsdtar（tar 命令），中文文件名的 manual/doc 目录可能报错但不影响核心内容
