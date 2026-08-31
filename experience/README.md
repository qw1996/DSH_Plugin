# dsh-skill-experience — 经验自我进化插件

让 DSH 的 agent 把"已建成上下文 + 遇到的问题"蒸馏成可复用**技能**，持久化、跨会话/项目**继承**，并在未来任务前**召回**——形成"沉淀 → 继承 → 召回 → 再沉淀"的自我进化闭环。

本插件**不重建** DSH 的技能发现/继承/热重载机制，而是复用既有能力，只补上**缺失的"经验捕获闭环"**。

## 核心洞察：DSH 已自带继承基础设施

| 能力 | DSH 既有机制 | 本插件是否重建 |
|---|---|---|
| 技能持久化 | `dsh-skill-filesystem` 扫描 `~/.dsh/skills`（rank 400，全局）与 `<projectRoot>/.dsh/skills`（rank 100，项目级）的 `SKILL.md` | 否，直接写入这两个根 |
| 热重载 | Chokidar 监视 + 一手 `write`/`edit` 工具触发 `fs/observed` 即时失效 | 否，靠模型的 `write` 工具落盘即触发 |
| 跨项目/会话继承 | 用户全局根被所有会话的 `ctx.skills.snapshot()` 合并 | 否，写入即继承 |
| 跨会话召回 | `ctx.sessionQuery`（SQLite FTS5 全文检索所有历史会话）+ `dsh-session-reference`（`@会话` 引用注入快照） | 否，`experience_recall` 直接桥接 |
| 技能触达模型 | `dsh-tool-skill` 在每个 pre-step 渲染技能目录 + 注册 `skill` 工具 | 否 |

真正缺的是——**把"做完的事/踩过的坑"蒸馏成技能并落盘的捕获循环**。这正是本插件提供的。

## 闭环

```
召回(recall-experience) → 执行任务 → 沉淀(experience_capture 计算) → 模型 write 落盘 → fs/observed 热重载 → 继承(下一个 pre-step 进入目录) → 回到召回
```

`experience_capture` 工具**只做计算**（技能名 + 完整 SKILL.md 正文 + 目标路径），由模型的 `write` 工具落盘——这触发 `fs/observed` 即时热重载、原生处理沙箱与主目录。这正与 DSH 自身的 `editing-cordis-compositions` 技能"用 write/edit 写文件"范式一致。

## 分层继承

| scope | 写入路径 | 继承范围 | 判据 |
|---|---|---|---|
| `user`（默认） | `~/.dsh/skills/exp-<slug>/SKILL.md` | 跨所有项目/会话 | 通用经验（与具体仓库无关的命令/流程/坑） |
| `project` | `<projectRoot>/.dsh/skills/exp-<slug>/SKILL.md` | 仅当前项目 | 只对本仓库/本部署成立的经验 |

## 双触发

- **显式**：用户键入 `/learn-experience` / `/recall-experience`，或调用 `experience_capture` / `experience_recall` 工具。
- **自动（常驻）**：种子技能 `learn-experience` 的 `whenToUse` 写成"完成目标/解决难题后使用"强信号，模型在 pre-step 目录匹配下自动加载（启发式自动触发）。硬自动触发（每轮 `systemPrompt` 常驻提醒）见 `src/index.ts` 的 `systemPrompt.context()` 扩展点注释。

## 安装（在仓库根目录运行 setup.ps1）

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1 -Plugins experience
```

`setup.ps1` 会：本地路径 `npm install ./experience/dsh-skill-experience` → 并入 `composition/host.patch.yml` → 重启。

### 手动步骤（等价于 setup.ps1）

1. 在 DSH profile 目录本地安装：
   ```bash
   npm install ./experience/dsh-skill-experience
   ```
2. 把 `composition/host.patch.yml` 并入 profile 的 `cordis.patch.yml`：
   ```yaml
   - insert:
       - id: skill-experience
         name: '@qinwei/dsh-skill-experience'
   ```
3. 重启 DSH。验证：`/` 触发见 `learn-experience` / `recall-experience`；工具见 `experience_capture` / `experience_recall` / `experience_list`。

## 使用

### 沉淀一条经验
```
experience_capture(
  title: "免密 SSH 失败的根因",
  problem: "ssh 免密突然要求密码；known_hosts、sshd_config 正常",
  solution: "家目录 .ssh 权限被改宽到 777；chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys 后恢复",
  context: "openEuler 24.03；audit 日志无异常；root 家目录权限被某次 tar 解包改宽",
  tags: "ssh,ops,permissions",
  scope: "user"
)
```
→ 返回 `{ skillName, path, content, nextAction }`。模型用 `write` 工具把 `content` 写入 `path`，下一个 pre-step 即在技能目录看到它。

### 任务前召回
```
experience_recall(query: "ssh 免密 权限", limit: 10)
```
→ 返回匹配的 `exp-*` 经验技能（用 `skill` 工具加载正文）+ 相关历史会话片段（用 `@[标题](dsh-session:<id>)` 注入快照）。

### 审视与策展
```
experience_list()   # 列出当前可见的所有 exp-* 经验技能
```
对过时经验，用 `edit`/删除其 `SKILL.md` 维护（同样热重载）。

## 动态形态（无需构建）

`host.js` 是 `cordis_define` 的 `code.host` 求值体，vm 安全（禁用 `require`/`process`），可用 `cordis_define` + `cordis_run` 临时挂载（进程级，重启消失）。适合快速验证。

## 构建（改源码后）

本包无 typert（无 `@Remote`），仅 `tsdown` 打包：

```bash
cd experience/dsh-skill-experience
npm install --cache <本地缓存目录>
npm run bundle    # 产物 lib/index.js + lib/index.d.ts
```

`_smoke.cjs` 可在纯 Node 下验证控制流：`node _smoke.cjs`。

## 诚实说明

- **召回依赖可选后端**：`experience_recall` 的历史会话全文检索需组合 `@deepseek-ai/dsh-session-query-sqlite`；否则仅召回已沉淀经验（`sessionQueryAvailable: false` 如实报告）。
- **自动触发是启发式**：依赖模型对种子技能 `whenToUse` 的目录匹配；硬钩子见 `src/index.ts` 的 `systemPrompt` 扩展点。
- **经验是受信本地内容**：写入的 SKILL.md 会被未来会话当作普通技能加载执行；正文应自洽、可执行、可审计；敏感凭据勿入经验。
