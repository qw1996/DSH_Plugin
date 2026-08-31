// dsh-skill-experience —— Host 半（作为 cordis_define 的 code.host 使用）
// 自我进化经验闭环：捕获经验 →（由模型 write 工具落盘）→ 既有 skill 文件系统热重载继承 → 跨会话召回
//
// 设计（与 DSH 既有机制对齐，不自建发现/继承）：
//  1. 经验本身就是一个 SKILL.md。本工具只做“计算”：生成技能名 + 完整正文 + 目标路径，
//     由模型的 `write` 工具落盘。`write` 触发 `fs/observed`，使 dsh-skill-filesystem 立即失效，
//     下一个 pre-step 即把新经验技能纳入目录——继承是“免费”的。
//  2. 种子技能 learn-experience / recall-experience 经 ctx.skills.register 运行时注册（rank 250），
//     插件挂载即在所有会话可见；其 description/whenToUse 让模型在“完成目标/解决难题”时自动加载（自动触发）。
//  3. experience_recall 桥接 ctx.sessionQuery.searchSessions（若已组合全文检索后端）召回历史会话，
//     并用 ctx.skills.list 列出已继承的经验技能。
//
// 约束（cordis-plugin-development SKILL）：host 半在 vm 中求值，禁用 require/process/os/Buffer/fetch/原生定时器；
// 文件访问走 ctx.get('fs')，主目录由模型用其一手工具解析。本文件因此不直接读写文件。

return {
  inject: ['skills'], // skills 必需（注册种子技能 + list 召回）；sessionQuery 可选（ctx.get）
  async apply(ctx) {
    // ---------- 工具：纯字符串辅助 ----------
    function slugify(s) {
      return String(s == null ? '' : s)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'untitled'
    }
    function isSkillName(n) { return /^[a-z0-9][a-z0-9-]*$/.test(n) }
    function yamlStr(s) {
      return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"'
    }
    function nowIso() {
      try { return new Date().toISOString() } catch (e) { return String(Date.now()) }
    }
    function joinPath() {
      var parts = []
      for (var i = 0; i < arguments.length; i++) {
        var p = String(arguments[i] == null ? '' : arguments[i]).replace(/[\\/]+$/g, '')
        if (p) parts.push(p)
      }
      var joined = parts.join('/')
      // 折叠重复分隔符
      joined = joined.replace(/\/+/g, '/')
      return joined
    }

    // ---------- 经验捕获：计算技能名 + 完整正文 + 目标路径 ----------
    async function capture(input) {
      input = input || {}
      var title = String(input.title || '').trim()
      var problem = String(input.problem || '').trim()
      var solution = String(input.solution || '').trim()
      if (!title || !problem || !solution) {
        return { ok: false, error: 'title / problem / solution 三者必填' }
      }
      var scope = input.scope === 'project' ? 'project' : 'user'
      var baseSlug = 'exp-' + slugify(title)
      if (!isSkillName(baseSlug)) return { ok: false, error: '生成的技能名不合法: ' + baseSlug }

      // 策展：查 ctx.skills.list 是否已有同名，版本递增
      var slug = baseSlug, version = 1
      try {
        var skills = ctx.get('skills')
        if (skills && typeof skills.list === 'function') {
          var existing = {}
          var all = await skills.list()
          for (var i = 0; i < all.length; i++) existing[all[i].name] = true
          if (existing[baseSlug]) {
            var v = 2
            while (existing[baseSlug + '-v' + v]) v++
            version = v
            slug = baseSlug + '-v' + v
          }
        }
      } catch (e) { /* list 失败不阻塞，沿用 baseSlug */ }

      var tags = Array.isArray(input.tags)
        ? input.tags.map(String)
        : (typeof input.tags === 'string' ? input.tags.split(',').map(function (x) { return x.trim() }).filter(Boolean) : [])
      var whenToUse = String(input.whenToUse || ('当遇到与「' + title + '」相似的任务时使用')).slice(0, 480)
      var context = String(input.context || '').trim()
      var sessionRef = String(input.sessionRef || '').trim()
      var created = nowIso()

      var lines = [
        '---',
        'name: ' + yamlStr(slug),
        'description: ' + yamlStr(whenToUse),
        'whenToUse: ' + yamlStr(whenToUse),
        'metadata:',
        '  experience: true',
        '  scope: ' + scope,
        '  version: ' + version,
        '  created: ' + yamlStr(created)
      ]
      if (tags.length) lines.push('  tags: ' + yamlStr(tags.join(', ')))
      if (sessionRef) lines.push('  sessionRef: ' + yamlStr(sessionRef))
      lines.push('---', '', '# ' + title, '', '## 问题', '', problem, '', '## 解决方案', '', solution, '')
      if (context) lines.push('## 上下文与关键细节', '', context, '')
      lines.push('## 标签', '', tags.length ? tags.map(function (t) { return '- ' + t }).join('\n') : '（无）', '')
      lines.push('## 元数据', '', '- scope: ' + scope, '- version: ' + version, '- created: ' + created, sessionRef ? '- sessionRef: ' + sessionRef : null, '')
      lines.push('> 本经验由 `experience_capture` 计算生成，由模型的 `write` 工具落盘；经 dsh-skill-filesystem 热重载后跨会话/项目继承，可被 `experience_recall` 召回。')
      var content = lines.filter(function (x) { return x !== null }).join('\n') + '\n'

      // 目标路径：项目域尽量具体；用户域给模板（模型解析 ~ / dshHome）
      var path
      if (scope === 'project') {
        var ws = null
        try { var sp = ctx.get('sandboxPolicy'); if (sp && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) ws = sp.workspaceRoot } catch (e) {}
        path = ws
          ? joinPath(ws, '.dsh', 'skills', slug, 'SKILL.md')
          : joinPath('<projectRoot>', '.dsh', 'skills', slug, 'SKILL.md')
      } else {
        path = '~/.dsh/skills/' + slug + '/SKILL.md'
      }

      return {
        ok: true,
        skillName: slug,
        scope: scope,
        version: version,
        path: path,
        content: content,
        nextAction: scope === 'project' && path.indexOf('<projectRoot>') >= 0
          ? '先用 pwsh/bash 定位项目根（最近 .git 祖先），再用 `write` 工具在以上 `path` 落盘 `content`。'
          : (scope === 'user'
            ? '先解析 dshHome（pwsh: `echo $env:DSH_HOME`，默认 `~/.dsh`；Unix: `echo $DSH_HOME`，默认 `$HOME/.dsh`），再把 `path` 中的 `~` 替换为该绝对路径，用 `write` 工具落盘 `content`。`write` 会触发 fs/observed，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。'
            : '用 `write` 工具在以上 `path` 落盘 `content`。')
      }
    }

    // ---------- 经验召回：既有经验技能 + 历史会话全文检索 ----------
    async function recall(input) {
      input = input || {}
      var query = String(input.query || '').trim()
      var limit = Math.max(1, Math.min(50, Number(input.limit) || 10))
      var out = { query: query, skills: [], sessions: [], totalSkills: 0, sessionQueryAvailable: null }

      // 1) 既有经验技能（注册表合并的，含文件系统继承的 exp-*）
      try {
        var skills = ctx.get('skills')
        if (skills && typeof skills.list === 'function') {
          var all = await skills.list()
          var exps = all.filter(function (s) {
            return (s.name && /^exp-/.test(s.name)) || (s.metadata && (s.metadata.experience === true || s.metadata.experience === 'true'))
          })
          out.totalSkills = exps.length
          var q = query.toLowerCase()
          var words = q ? q.split(/\s+/).filter(Boolean) : []
          var matched = words.length === 0
            ? exps
            : exps.filter(function (s) {
                var hay = ((s.name || '') + ' ' + (s.description || '') + ' ' + (s.whenToUse || '')).toLowerCase()
                return words.some(function (w) { return hay.indexOf(w) >= 0 })
              })
          out.skills = matched.slice(0, limit).map(function (s) {
            return { name: s.name, description: s.description, whenToUse: s.whenToUse, source: s.source }
          })
        }
      } catch (e) { out.skillError = String((e && e.message) || e) }

      // 2) 历史会话全文检索（若 sessionQuery 已组合）
      if (query) {
        try {
          var sq = ctx.get('sessionQuery')
          if (sq && typeof sq.searchSessions === 'function') {
            out.sessionQueryAvailable = true
            var page = await sq.searchSessions({ query: query, limit: limit })
            var hits = (page && page.hits) || []
            out.sessions = hits.slice(0, limit).map(function (h) {
              var bm = h.bestMatch || {}
              return { sessionId: h.sessionId, title: h.title, cwd: h.cwd, snippet: bm.snippet || h.snippet || '' }
            })
          } else {
            out.sessionQueryAvailable = false
          }
        } catch (e) { out.sessionError = String((e && e.message) || e) }
      }

      out.note = (out.sessions.length || out.skills.length)
        ? '已检索历史会话与既有经验技能。若要把某条历史会话蒸馏为技能，调用 experience_capture 并把 sessionRef 传入。'
        : '无匹配经验。可先用 experience_capture 沉淀当前任务的经验。'
      return out
    }

    // ---------- 列出经验技能（走注册表，免文件 IO） ----------
    async function listExperiences() {
      var result = { ok: true, user: [], project: [], totalCount: 0 }
      try {
        var skills = ctx.get('skills')
        if (!skills || typeof skills.list !== 'function') {
          result.error = 'ctx.skills 不可用'
          return result
        }
        var all = await skills.list()
        var exps = all.filter(function (s) {
          return (s.name && /^exp-/.test(s.name)) || (s.metadata && (s.metadata.experience === true || s.metadata.experience === 'true'))
        })
        for (var i = 0; i < exps.length; i++) {
          var s = exps[i]
          var bucket = (s.metadata && s.metadata.scope === 'project') ? 'project' : 'user'
          result[bucket].push({ name: s.name, description: s.description, whenToUse: s.whenToUse, source: s.source, scope: bucket })
        }
        result.totalCount = exps.length
      } catch (e) { result.error = String((e && e.message) || e) }
      return result
    }

    // ---------- 工具渲染 ----------
    function renderText(value) {
      try {
        var j = JSON.stringify(value, null, 2)
        return j.length > 8000 ? j.slice(0, 8000) + '\n...(truncated)' : j
      } catch (e) { return String(value) }
    }
    function makeTool(name, description, parameters, execute) {
      return harness.defineTool({
        name: name, description: description, parameters: parameters,
        output: { schema: { type: 'object', additionalProperties: true }, render: function (a, v) { return [{ type: 'text', text: renderText(v) }] } },
        execute: function (args) { return execute(args) }
      })
    }

    var toolDefs = [
      makeTool('experience_capture', 'Distill a reusable experience (a solved problem, a non-obvious fix, a lesson about this codebase/tooling) into a durable skill file that is inherited across sessions and projects. This tool COMPUTES the skill name, full SKILL.md content, and target path; you then write the file with your `write` tool (which hot-reloads the skill provider). Call this when you have just completed a goal, solved a hard problem, or found a workaround worth remembering — or when the user asks to "remember this".', {
        title: { type: 'string', required: true, description: 'Short title of the experience (becomes part of the skill name, kebab-cased, exp- prefixed)' },
        problem: { type: 'string', required: true, description: 'What problem/symptom was encountered; enough context to recognize it again' },
        solution: { type: 'string', required: true, description: 'What worked — the concrete steps, command, or reasoning that solved it' },
        context: { type: 'string', description: 'Optional: key details, gotchas, environment facts, error messages' },
        tags: { type: 'string', description: 'Comma-separated tags for later recall' },
        whenToUse: { type: 'string', description: 'Optional: when future tasks should reuse this (defaults to a phrase derived from the title)' },
        scope: { type: 'string', enum: ['user', 'project'], description: 'user = global inheritance (default, ~/.dsh/skills); project = current project only (<projectRoot>/.dsh/skills)' },
        sessionRef: { type: 'string', description: 'Optional: a dsh-session:<id> reference to the session this experience came from' }
      }, function (args) { return capture(args) }),

      makeTool('experience_recall', 'Search past sessions (full-text) and existing experience skills for lessons relevant to the current task, BEFORE acting on a non-trivial task. Returns matching experience skills (loadable via the `skill` tool) and historical session snippets (injectable via dsh-session: references).', {
        query: { type: 'string', required: true, description: 'Whitespace-separated literal phrases describing the current task/problem (used for both skill matching and session full-text search)' },
        limit: { type: 'integer', description: 'Max results per category (default 10, max 50)' }
      }, function (args) { return recall(args) }),

      makeTool('experience_list', 'List all distilled experience skills currently visible to this session (global + project, via the skill registry). Use to review what the agent has learned and decide what to curate (edit/delete the underlying SKILL.md files).', {}, function (args) { return listExperiences() })
    ]

    for (var i = 0; i < toolDefs.length; i++) {
      (function (t) { ctx.effect(function () { return harness.registerTool(ctx, t) }) })(toolDefs[i])
    }

    // ---------- 运行时种子技能：learn / recall 的“使用说明” ----------
    var learnSkill = {
      name: 'learn-experience',
      description: 'Self-evolution: use when you have just completed a goal, solved a non-trivial problem, discovered a reusable workaround, or learned something about this codebase/tooling that future sessions would benefit from. Distills the experience into a durable skill that is inherited across all sessions and projects.',
      whenToUse: 'After completing a goal; after solving a hard problem; after finding a non-obvious fix, workaround, or root cause; or when the user asks to "remember this" / "save this as experience".',
      content: [
        '# learn-experience — 经验沉淀（自我进化）',
        '',
        '本技能是 agent 自我进化闭环的“捕获触发器”。DSH 已把技能文件系统作为持久记忆：任何写入用户全局根 `~/.dsh/skills/<name>/SKILL.md`（跨所有项目/会话继承）或项目根 `<projectRoot>/.dsh/skills/<name>/SKILL.md`（仅当前项目继承）的技能，都会被 `dsh-skill-filesystem` 经 Chokidar + `fs/observed` 热重载，在下一个 pre-step 自动进入技能目录，被未来所有会话继承。',
        '',
        '## 何时沉淀',
        '',
        '- 刚完成一个目标（goal）且过程中有非平凡的决策或绕行；',
        '- 解决了一个难题、找到一个非显然的修复或根因；',
        '- 发现了一条关于本代码库/工具链/部署的、下次会再次踩到的经验；',
        '- 用户明确要求“记住这个/存为经验”。',
        '',
        '## 如何沉淀（两步）',
        '',
        '**第 1 步：计算。** 调用 `experience_capture` 工具，填写：',
        '',
        '- `title`：简短标题（自动 kebab-case 化并加 `exp-` 前缀）；',
        '- `problem`：遇到了什么问题/症状，写到“下次能认出来”的程度；',
        '- `solution`：什么奏效——具体步骤、命令或推理；',
        '- `context`：关键细节、陷阱、环境事实、报错原文（可选但强烈建议）；',
        '- `tags`：逗号分隔的标签，便于日后召回；',
        '- `scope`：`user`（默认，全局继承）或 `project`（仅当前项目继承）。判据：通用经验入 `user`，仅对本仓库/本部署成立的入 `project`；',
        '- `sessionRef`：可用 `@[标题](dsh-session:<id>)` 关联来源会话（可选）。',
        '',
        '工具返回 `{ skillName, scope, path, content, nextAction }`。同名经验自动版本递增（`exp-foo` → `exp-foo-v2`），不会覆盖。',
        '',
        '**第 2 步：落盘。** 用你的 `write` 工具，在 `path` 处写入 `content`。这一步触发 `fs/observed`，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。',
        '',
        '### 路径解析',
        '',
        '- **项目域**：`path` 通常已是绝对路径（基于当前工作区根）；若仍是 `<projectRoot>` 模板，先用 pwsh/bash 定位最近 `.git` 祖先替换之。',
        '- **用户域**：`path` 形如 `~/.dsh/skills/<name>/SKILL.md`。先解析 dshHome：',
        '  - Windows pwsh：`echo $env:DSH_HOME`（缺省 `$env:USERPROFILE\\.dsh`）；',
        '  - Unix bash：`echo $DSH_HOME`（缺省 `$HOME/.dsh`）；',
        '  - 把 `path` 中的 `~` 替换为该绝对路径后落盘。',
        '- 若默认 `workspace-write` 策略拒绝写 `~/.dsh`，按 `write` 工具的指引用 `sandbox_permissions` 重试一次（同编辑 preset 文件的标准流程）。',
        '',
        '## 策展原则',
        '',
        '- 沉淀前先用 `experience_recall` 查是否已有相似经验，优先补充而非重复；',
        '- 经验是“写给未来的自己”的指令：用祈使句、给可复制的命令、标明前提条件；',
        '- 经验会被未来会话当作普通技能加载，所以正文要自洽、可执行；',
        '- 用 `experience_list` 审视已积累的经验，对过时的用 `edit`/删除其 SKILL.md 维护。',
        '',
        '> 落盘完成后，你会在下一次 pre-step 的技能目录里看到这条 `exp-` 技能。这就是“能力可继承”的实现路径。'
      ].join('\n')
    }
    var recallSkill = {
      name: 'recall-experience',
      description: 'Self-evolution: use at the start of a non-trivial task that resembles past work — searches past sessions (full-text) and existing experience skills for relevant lessons, so you can apply prior solutions instead of rediscovering them.',
      whenToUse: 'Before acting on a non-trivial task that resembles something you or a past session may have solved; before debugging a recurring symptom; when a task “feels familiar”.',
      content: [
        '# recall-experience — 经验召回',
        '',
        '在做非平凡任务之前先召回，避免重复踩坑。本技能是 agent 自我进化闭环的“召回触发器”。',
        '',
        '## 如何召回',
        '',
        '调用 `experience_recall`，参数：',
        '',
        '- `query`：用空格分隔的字面短语描述当前任务/问题（同时用于匹配已有经验技能与历史会话全文检索）；',
        '- `limit`：每个类别的最大条数（默认 10）。',
        '',
        '返回两类结果：',
        '',
        '1. **既有经验技能**（`exp-*`）：匹配上的、已沉淀的可复用经验，用 `skill` 工具加载其完整正文并遵循；',
        '2. **历史会话片段**：来自 `ctx.sessionQuery`（若部署组合了 `@deepseek-ai/dsh-session-query-sqlite` 全文检索后端）的相关会话摘录；可用 `@[标题](dsh-session:<id>)` 把其快照注入当前上下文细读。',
        '',
        '## 召回后做什么',
        '',
        '- 对匹配的经验技能，用 `skill` 工具加载其完整正文并遵循；',
        '- 对相关历史会话，用会话引用注入快照细读；',
        '- 若当前任务解决了新问题，事后用 `learn-experience` 沉淀，闭环自我进化。',
        '',
        '> 若 `sessionQueryAvailable: false`，说明部署未组合全文检索后端，此时仅召回已沉淀的经验技能。'
      ].join('\n')
    }

    try {
      var skillsReg = ctx.get('skills')
      if (skillsReg && typeof skillsReg.register === 'function') {
        ctx.effect(function () { return skillsReg.register(learnSkill) })
        ctx.effect(function () { return skillsReg.register(recallSkill) })
      } else {
        console.warn('[experience] ctx.skills 不可用，种子技能未注册；请确认 dsh-skill 已组合。')
      }
    } catch (e) { console.error('[experience] register seed skills failed:', (e && e.message) || e) }

    console.log('[experience] ready. sessionQuery=' + (!!ctx.get('sessionQuery')))
  }
}
