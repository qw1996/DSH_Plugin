# DSH_Plugin

DeepSeek Harness（DSH）插件集合。**每个插件一个目录**，目录内含一个或多个 npm 包（已构建 `lib/` 产物随仓库提交）。

## 插件列表

| 插件 | 说明 |
|---|---|
| [server-manager](./server-manager) | 服务器纳管：增删改查、SSH 下发命令、定期巡检、BMC 电源 / BIOS（Redfish，华为 iBMC），含浏览器仪表盘 |
| [experience](./experience) | 经验自我进化：把解决的问题蒸馏成可继承技能，任务前召回历史经验，能力跨会话/项目进化 |

## 一键安装（在另一台机器）

前提：已装 DSH、Node.js、（server-manager 需）OpenSSH 客户端、git。

```powershell
git clone https://github.com/qw1996/DSH_Plugin.git
cd DSH_Plugin

# 装全部（server-manager + experience）
powershell -ExecutionPolicy Bypass -File setup.ps1

# 或只装某一个
powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins experience
powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins server-manager -PresetId <你的preset id>
```

`setup.ps1` 做的事：

1. 用**本地路径** `npm install` 把各包装入 DSH profile（规避 npm git 子目录语法 `#main::path:` 在不同版本间不稳定的问题）；
2. 把各插件的组合补丁（`<插件>/composition/*.patch.yml`）幂等并入 profile 的 `cordis.patch.yml`（与 agent preset 的 `agent.cordis.yml`）；
3. （server-manager）若 `server-manager/servers.local.json` 存在则写入库存文件；
4. 重启 DSH（`-NoRestart` 跳过）。

> server-manager 的 8 个模型工具要挂到 agent preset，需传 `-PresetId <id>`；不传则只装后端 + 仪表盘。
> 想预置服务器：把 `server-manager/servers.example.json` 复制成 `server-manager/servers.local.json`（已 gitignore）填真实地址，脚本自动写入库存文件。

## 目录约定

```
DSH_Plugin/
  README.md                 # 本索引
  setup.ps1                 # 一键安装脚本
  .gitignore
  <插件名>/                  # 每个插件一个目录
    <包名>/                  #   一个或多个 npm 包（含已构建 lib/）
      package.json
      src/  lib/  tsdown.config.ts
    composition/            #   host.patch.yml + preset.patch.yml 挂载片段
    README.md               #   插件说明（安装 / 构建 / 使用）
```

## 安全

- 公开包**不内置任何服务器清单或凭据**；服务器在「设置 → 服务器管理」里手动添加。
- `servers.local.json`（含真实 IP/密码）被 `.gitignore` 忽略，永不进 GitHub。
- 提交前已确认仓库内无本机敏感信息（IP、密码、本机绝对路径）。

## 重新构建（改源码后）

各包是 TypeScript 源码，用 `tsdown` 打包。在对应包目录：

```bash
cd <插件>/<包名>
npm install --cache <本地缓存目录>   # 规避 Windows npm cache EPERM
npm run bundle
```

> `lib/` 产物已提交，目标机无需构建工具链即可用 setup.ps1 安装。
