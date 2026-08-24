# @qinwei/dsh-server-manager

DeepSeek Harness（DSH）服务器纳管插件：纳管多台服务器（华为 iBMC / Redfish）。

- 服务器信息增删改查（持久化到 `dsh-server-inventory.json`）
- SSH 下发命令（免密，单机 / 逗号列表 / `all`，带超时）
- 定期巡检（每 5 分钟）+ 手动巡检（hostname/OS/内核/uptime/负载/内存/磁盘/CPU）
- BMC 电源控制 + BIOS 读写（Redfish，华为 iBMC）
- 浏览器「服务器管理」仪表盘（设置 → 服务器管理）
- 插件自更新（`git pull` + 更新按钮 / `server_update_plugin` 工具）

## 一键安装与生效（两个包 + 挂载 + 重启）

两个 npm 包均已构建（`lib/` 已提交）：根目录的**主包**（后端服务 + 浏览器 UI）和 `server-manager/dsh-server-manager-tools/` 的**工具包**（8 个模型工具）。

> **最快方式：用 `setup.ps1` 脚本**（Windows）——
> `powershell -ExecutionPolicy Bypass -File setup.ps1 -Profile web -PresetId <你的preset id>`
> 它会自动装包 + 挂载两行 + 重启。想预置服务器，就把 `servers.example.json` 复制成
> `servers.local.json`（已 gitignore）填好真实地址，脚本会自动写入库存文件。
> 手动步骤见下面 1–3。

### 1. 安装两个包到 DSH profile

在 DSH 的 profile 目录（`~/.dsh/profiles/<name>/`）执行：

```bash
# 主包（后端 Service + 客户端 UI）
npm install github:qw1996/DSH_Plugin

# 工具包（8 个 server_* 模型工具，git 子目录需用 ::path: 语法）
npm install "github:qw1996/DSH_Plugin#main::path:server-manager/dsh-server-manager-tools"
```

> 若 git 子目录安装报错，用兜底：`git clone https://github.com/qw1996/DSH_Plugin`，再
> `npm install ./DSH_Plugin` 和 `npm install ./DSH_Plugin/server-manager/dsh-server-manager-tools`。

### 2. 挂载（加两行组合）

- **后端 + UI（host 平面）**：把 `server-manager/composition/host.patch.yml` 的内容并入
  `~/.dsh/profiles/<name>/cordis.patch.yml`：

  ```yaml
  - insert:
      - id: server-manager
        name: '@qinwei/dsh-server-manager'
  ```

- **8 个工具（agent 平面）**：把 `server-manager/composition/preset.patch.yml` 的内容并入目标
  agent preset 的 `agent.cordis.yml`：

  ```yaml
  - insert:
      - id: server-manager-tools
        name: '@qinwei/dsh-server-manager-tools'
  ```

### 3. 重启并验证

重启 DSH（web profile）。验证：浏览器「设置 → 服务器管理」出现仪表盘；起一个 agent 会话确认
`server_list` 等 8 个工具可用。

## 构建（改源码后需要）

本包是 TypeScript 源码，用 `tsdown` 打包、`@deepseek-ai/dsh-typert-generator` 从 `@Remote` 装饰器生成
`lib/typert.host.js` / `lib/typert.remote-client.js`。在装有 DSH 构建工具链的机器上：

```bash
npm install && npm run bundle
```

产物：`lib/index.js`、`lib/client.js`、`lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/types/*`。

> 构建需要本仓库之外的一套工作区布局（vendor 的 `@deepseek-ai/dsh-typert-protocol` 作为 workspace 包 +
> 聚合 `tsconfig.host.json`/`tsconfig.client.json` + `paths` 映射），详见 `server-manager/README.md`。

## 服务器纳管

本公开包**不内置任何服务器清单或凭据**。安装挂载后，在浏览器「设置 → 服务器管理」里添加服务器
（SSH 地址 / 用户 / 端口，BMC 地址 / 用户 / 密码），数据持久化到 `dsh-server-inventory.json`。

## 目录

```
DSH_Plugin/
  package.json  src/  lib/  tsdown.config.ts   # ← npm 包（根目录）
  server-manager/
    composition/host.patch.yml, preset.patch.yml
    dsh-server-manager-tools/                   #   8 个 server_* 模型工具包
    README.md                                   #   详细说明
```

## 自动更新

插件内置「更新插件」按钮（浏览器「服务器管理」页底部）与 `server_update_plugin` 模型工具：点击/调用后从配置的
仓库路径执行 `git pull`，返回 `changed`、前后 commit、最近日志。自更新仓库路径通过环境变量
`DSH_SERVER_MANAGER_REPO` 配置（留空则禁用自更新）。
