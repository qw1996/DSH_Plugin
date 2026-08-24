# dsh-server-manager — 服务器纳管插件

纳管多台服务器（华为 iBMC / Redfish）的 Cordis 插件：

- 服务器信息增删改查（持久化到 `dsh-server-inventory.json`）
- SSH 下发命令（免密，单机 / 逗号列表 / `all`，带超时）
- 定期巡检（每 5 分钟）+ 手动巡检（hostname/OS/内核/uptime/负载/内存/磁盘/CPU）
- BMC 电源控制 + BIOS 读写（Redfish，华为 iBMC）
- 浏览器「服务器管理」仪表盘（设置 → 服务器管理）

## 重要：当前是「动态插件」，不是可安装包

本插件由 `cordis_define` + `cordis_run` 创建，**只存在于当前 DSH 进程内存**：
进程重启即消失，不随会话迁移，也不是磁盘上的一个包。
要安装到其他机器，二选一。

## 服务器纳管

本公开包**不内置任何服务器清单或凭据**：安装挂载后，在浏览器「设置 → 服务器管理」里添加服务器。

---

## 方案 A：正式 npm 包 + composition row（推荐）

### A1. 改写为正式包

动态沙箱 API → 正式 Cordis API 的对应关系：

| 动态写法（本仓库 host.js/client.js） | 正式包写法 |
|---|---|
| `harness.defineTool(opt)` | `import { defineTool } from '@deepseek-ai/dsh-tools'` |
| `harness.registerTool(ctx, t)` | `ctx.tools.register(defineTool({...}))` |
| `harness.handle('m', fn)`（Host） | typert Remote 服务（`@Remote` 方法）做 Host↔Client |
| `host.call('m', args)`（Client） | 对应 Remote 的客户端调用 |
| `styles.insert(css)` | 正式 client 插件的 styles API |
| `slots.inject('settings.section', cb)` | 正式 slots API |
| `ctx.effect(() => disposer)` | 标准 Cordis `ctx.effect` |

### A2. 拆到正确的平面

- **8 个模型工具**（`server_list/add/update/delete/exec/inspect/bmc_power/bmc_bios`）→ **agent preset**（每会话一份）。
- **后台服务**（库存状态、`fs` 持久化、`timer` 巡检、SSH/BMC 操作）→ **host composition**（跨会话共享、单实例）。
- **浏览器 UI**（`dsh.client` roster）→ host 平面的 client modules 行。

> 判据：有会话外消费者的、或跨会话共享状态/写盘的 → host 平面；只给单个 agent 加工具的 → preset。

### A3. 发布 + 安装

1. `npm publish`（或推到 git，目标机 `npm install <git-url>` / 本地 `npm pack` 安装 tarball）。
2. 目标机加 row：
   - 后台 + client UI → 该 deployment 的 host composition / profile 的 `cordis.patch.yml`。
   - 模型工具 → 目标 agent preset 的 `agent.cordis.yml`。
3. 用 `standingKeyFor` / mount 校验，再起一个真实会话确认工具列表。

## 方案 B：导出源码 + 动态重建（快速，进程级）

本插件 `dsh-server-manager/host.js`、`client.js` 就是 `cordis_define` 的 `code.host` / `code.client` 函数体。

在任意一台装了 DSH 的机器上：

1. 读入两个文件内容。
2. 调用 `cordis_define`（`kind:"new"`，`idPrefix:"srvmg"`），把 `host.js` 内容作为 `code.host`、`client.js` 内容作为 `code.client`。
3. `cordis_run`（带 UI 的 client 半需在 Cordis 面板批准一次，可选「允许此插件的后续版本」）。
4. 进程重启后插件消失，需重新 define + run。

> 局限：动态插件不能跨进程持久，也不能免去每台机器上的 define/run 步骤；适合临时验证，不适合长期纳管。

## 依赖的环境事实

- SSH：主机需能免密 `ssh` 到四台服务器（OpenSSH 客户端）。
- BMC Redfish：主机能 `curl -k https://<bmc>/redfish/v1/...`（插件走 `subprocess` 直调 curl，TLS 在本机进程上下文可用）。
- 持久化文件写在 harness 的 `process.cwd()`（`sandboxPolicy.workspaceRoot`）下，文件名为 `dsh-server-inventory.json`。

---

## 方案 A 已产出：构建与发布步骤

本插件已按「一个插件一个目录」整理为**源码包**（TypeScript + package.json + composition），结构如下：

```
server-manager/                 # 插件目录
  composition/host.patch.yml    #   host 平面 row
  composition/preset.patch.yml  #   agent preset row
  dsh-server-manager/           #   主包：后端 Service + 客户端 UI（双面包）
    package.json                #     dsh.client 声明 + typert 导出
    src/index.ts                #     ServerManagerService（@Remote + SSH/BMC/巡检/持久化）
    src/types.ts                #     zod 派生的 @Remote 契约类型
    src/client.ts               #     设置页仪表盘（ctx.remote.serverManager）
    host.js / client.js         #     动态插件源码（方案 B）
  dsh-server-manager-tools/     #   工具包：8 个 server_* 模型工具
    package.json
    src/index.ts                #     defineTool + ctx.tools.register（inject serverManager）
```

### 1. 构建（需要 DSH 构建工具链）

正式包用 TypeScript 编写、`tsdown` 打包、`@deepseek-ai/dsh-typert-generator` 从 `@Remote` 装饰器生成
`lib/typert.host.js` / `lib/typert.remote-client.js`（类型/远程契约）。在装有该工具链的机器上：

```bash
cd server-manager/dsh-server-manager && npm install && npm run bundle && cd ../..
cd server-manager/dsh-server-manager-tools && npm install && npm run bundle && cd ../..
```

产物：`lib/index.js`、`lib/client.js`、`lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/types/*.d.ts`。

### 2. 发布（已构建，lib/ 已提交到 git；包在仓库根目录）

`lib/` 构建产物已提交到本仓库，目标机无需本地构建工具链，直接从 GitHub 安装（**包就在仓库根，无需 git 子目录语法**）：

```bash
# 主包（后端 Service + 客户端 UI，含 lib/typert.host.js 等生成契约）
npm install github:qw1996/DSH_Plugin
```

> 无 npm 账号也可用 git 直装；如需重新构建（改源码后），在装有 DSH 工具链的机器上：
> `npm install && npm run bundle`（在仓库根目录），产物为 `lib/index.js`、`lib/client.js`、
> `lib/typert.host.js`、`lib/typert.remote-client.js`、`lib/types/*`。

### 3. 目标机安装 + 挂载

1. `npm install github:qw1996/DSH_Plugin`（工具包待发布后同样 git 直装）。
2. 把 `server-manager/composition/host.patch.yml` 内容并入 host composition（或 profile 的 `cordis.patch.yml`）。
3. 把 `server-manager/composition/preset.patch.yml` 内容并入目标 agent preset 的 `agent.cordis.yml`。
4. 对 preset 做 `standingKeyFor(id)` mount 校验，再起一个真实会话确认 8 个工具与「服务器管理」页出现。

### 必须验证/可能需微调的点（诚实说明）

- **typert 类型生成**：`@Remote` 方法已改用**单对象请求参数 + zod 派生的严格类型**（见 `src/types.ts`，
  `z.infer` 派生 `Server`/`Check`/各 Request/Result）。这大幅降低生成不确定性，但 `z.record(z.unknown())`
  之类的动态叶子字段（BIOS 属性表、指标）仍建议在首次构建时确认生成的契约与期望一致。
- **`dsh.client.inject` 列表**（package.json）里列的客户端依赖包名需与目标 deployment 的模块表对齐。
- **`fs` 写盘沙箱 policy**、**`subprocess`/`sandboxPolicy` 注入名**沿用动态版已验证的写法，正式包下需 mount 确认。
- **`tsconfig.json` / `.npmignore` 已补**（`tsconfig` 启用 ES2022 + DOM + strict；`.npmignore` 兜底只发 `lib/`）。
- **构建已完成**：`lib/`（含 typert 生成的 `typert.host.js`/`typert.remote-client.js`）已提交到 git，可直接 `npm install github:...` 安装；上线前的 mount 校验（composition row 实际挂载 + 真实会话确认 8 个工具与仪表盘）仍是最后一步。

## 自动更新

插件内置「更新插件」按钮（浏览器「服务器管理」页底部）与 `server_update_plugin` 模型工具：

1. 点击/调用后，从配置的仓库路径（`REPO_PATH`）执行 `git pull`；
2. 返回 `changed`、前后 commit 哈希、最近提交日志；
3. 若 `changed=true`：
   - **动态插件**：由 agent 用 `cordis_define` + `cordis_run` 重新加载生效；
   - **永久包**：重新 `npm run bundle` 构建并重启 DSH 生效。

> 注意：仓库路径与 git 可执行文件路径在 `src/index.ts`（永久包）或 `host.js`（动态包）顶部的
> `REPO_PATH` / `GIT_PATH` 常量里配置，其他机器请改为本机实际路径。
