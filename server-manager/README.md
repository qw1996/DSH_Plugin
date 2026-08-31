# dsh-server-manager — 服务器纳管插件

纳管多台服务器（华为 iBMC / Redfish）的 DSH Cordis 插件：

- 服务器信息增删改查（持久化到 `dsh-server-inventory.json`）
- SSH 下发命令（免密，单机 / 逗号列表 / `all`，带超时）
- 定期巡检（每 5 分钟）+ 手动巡检（hostname/OS/内核/uptime/负载/内存/磁盘/CPU）
- BMC 电源控制 + BIOS 读写（Redfish，华为 iBMC）
- 浏览器「服务器管理」仪表盘（设置 → 服务器管理）
- 插件自更新（`git pull` + 更新按钮 / `server_update_plugin` 工具）

## 安装（在仓库根目录运行 setup.ps1）

本插件目录含两个已构建的 npm 包：主包 `dsh-server-manager/`（后端 Service + 客户端 UI）与 `dsh-server-manager-tools/`（8 个 `server_*` 模型工具）。

```powershell
# 在仓库根目录（git clone 后）
powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins server-manager -PresetId <你的preset id>
```

`setup.ps1` 会：本地路径 `npm install` 两个包 → 并入 `composition/host.patch.yml`（后端+UI）与 `composition/preset.patch.yml`（8 工具，需 `-PresetId`）→ 预置服务器（若 `servers.local.json` 存在）→ 重启。

不传 `-PresetId` 则只装后端 + 仪表盘，不挂 8 个工具。

### 手动步骤（等价于 setup.ps1）

1. 在 DSH profile 目录（`~/.dsh/profiles/<name>/`）本地安装两个包：
   ```bash
   npm install ./server-manager/dsh-server-manager
   npm install ./server-manager/dsh-server-manager-tools
   ```
2. 把 `composition/host.patch.yml` 并入 profile 的 `cordis.patch.yml`：
   ```yaml
   - insert:
       - id: server-manager
         name: '@qinwei/dsh-server-manager'
   ```
3. 把 `composition/preset.patch.yml` 并入目标 agent preset 的 `agent.cordis.yml`：
   ```yaml
   - insert:
       - id: server-manager-tools
         name: '@qinwei/dsh-server-manager-tools'
   ```
4. 重启 DSH，起会话确认 `server_list` 等 8 个工具与「服务器管理」页出现。

## 服务器纳管

公开包**不内置任何服务器清单或凭据**。安装挂载后，在浏览器「设置 → 服务器管理」里添加服务器（SSH 地址/用户/端口，BMC 地址/用户/密码），数据持久化到 `dsh-server-inventory.json`。

预置（不泄露凭据）：把 `servers.example.json` 复制成 `servers.local.json`（已 gitignore）填真实地址，`setup.ps1` 自动写入库存文件。

## 构建（改源码后需要）

主包用 TypeScript + `tsdown` + `@deepseek-ai/dsh-typert-generator`（从 `@Remote` 装饰器生成 `lib/typert.host.js` / `lib/typert.remote-client.js`）。

```bash
cd server-manager/dsh-server-manager
npm install --cache <本地缓存目录>   # 规避 Windows npm cache EPERM
npm run bundle
cd ../dsh-server-manager-tools
npm install --cache <本地缓存目录> && npm run bundle
```

> typert 类型生成需要 `@deepseek-ai/dsh-typert-protocol` 作为工作区包 + 聚合 `tsconfig.host.json`/`tsconfig.client.json` + `paths` 映射的工作区布局；`lib/` 已提交，目标机无需重建。

## 平面拆分

- **8 个模型工具** → agent preset（每会话一份）；
- **后台服务**（库存/`fs` 持久化/`timer` 巡检/SSH/BMC）→ host composition（跨会话单实例）；
- **浏览器 UI**（`dsh.client`）→ host 平面的 client modules 行。

## 依赖的环境事实

- SSH：主机需能免密 `ssh` 到目标服务器（OpenSSH 客户端）。
- BMC Redfish：主机能 `curl -k https://<bmc>/redfish/v1/...`（插件走 `subprocess` 直调 curl，TLS 在本机进程上下文可用）。
- 持久化文件写在 harness 的 `process.cwd()`（`sandboxPolicy.workspaceRoot`）下，文件名 `dsh-server-inventory.json`。

## 自动更新

插件内置「更新插件」按钮（浏览器「服务器管理」页底部）与 `server_update_plugin` 工具：从配置的仓库路径执行 `git pull`，返回 `changed`、前后 commit、最近日志。自更新仓库路径通过环境变量 `DSH_SERVER_MANAGER_REPO` 配置（留空则禁用自更新）。
