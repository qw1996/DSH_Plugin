// dsh-skill-experience —— 正式包形态（Host 半）
// 经验自我进化闭环：捕获经验 →（模型 `write` 落盘）→ dsh-skill-filesystem 热重载继承 → 跨会话召回
//
// 与动态形态 host.js 行为一致（Architecture B：工具只“计算”技能名+完整正文+目标路径，
// 由模型的一手 `write` 工具落盘以触发 fs/observed 即时热重载）。本形态有完整 Node 访问，
// 故用户域路径可解析为绝对路径；并预留 ctx.systemPrompt.context() 硬自动触发扩展点。
import { defineTool } from '@deepseek-ai/dsh-tools'
import os from 'node:os'
import path from 'node:path'

type Json = any

interface ExperienceInput {
  title: string
  problem: string
  solution: string
  context?: string
  tags?: string | string[]
  whenToUse?: string
  scope?: 'user' | 'project'
  sessionRef?: string
}

interface RecallInput {
  query: string
  limit?: number
}

// 自动更新留空则禁用；目标机器请改实际值或用环境变量。
const REPO_PATH = process.env.DSH_EXPERIENCE_REPO || ''

function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}
function isSkillName(n: string): boolean { return /^[a-z0-9][a-z0-9-]*$/.test(n) }
function yamlStr(s: unknown): string {
  return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"'
}
function nowIso(): string { return new Date().toISOString() }

function dshHome(): string {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}
function findProjectRoot(ctx: any): string {
  const sp = ctx.get('sandboxPolicy')
  let dir: string = (sp && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) ? sp.workspaceRoot : process.cwd()
  dir = path.resolve(dir)
  let cur = dir
  for (let i = 0; i < 40; i++) {
    try {
      const fs = require('node:fs')
      if (fs.existsSync(path.join(cur, '.git'))) return cur
    } catch (e) { /* ignore */ }
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return dir
}

export default {
  inject: ['skills'],

  async apply(ctx: any) {
    const skills = ctx.skills

    // ---------- 经验捕获：计算技能名 + 完整正文 + 目标路径 ----------
    async function capture(input: ExperienceInput): Promise<Json> {
      const title = String(input?.title || '').trim()
      const problem = String(input?.problem || '').trim()
      const solution = String(input?.solution || '').trim()
      if (!title || !problem || !solution) return { ok: false, error: 'title / problem / solution 三者必填' }

      const scope: 'user' | 'project' = input.scope === 'project' ? 'project' : 'user'
      const baseSlug = 'exp-' + slugify(title)
      if (!isSkillName(baseSlug)) return { ok: false, error: '生成的技能名不合法: ' + baseSlug }

      // 策展：查 ctx.skills.list 是否已有同名，版本递增
      let slug = baseSlug, version = 1
      try {
        const existing: Record<string, boolean> = {}
        const all = await skills.list()
        for (const s of all) existing[s.name] = true
        if (existing[baseSlug]) {
          let v = 2
          while (existing[baseSlug + '-v' + v]) v++
          version = v
          slug = baseSlug + '-v' + v
        }
      } catch (e) { /* list 失败不阻塞 */ }

      const tags: string[] = Array.isArray(input.tags)
        ? input.tags.map(String)
        : (typeof input.tags === 'string' ? input.tags.split(',').map((x) => x.trim()).filter(Boolean) : [])
      const whenToUse = String(input.whenToUse || ('当遇到与「' + title + '」相似的任务时使用')).slice(0, 480)
      const context = String(input.context || '').trim()
      const sessionRef = String(input.sessionRef || '').trim()
      const created = nowIso()

      const lines: (string | null)[] = [
        '---',
        'name: ' + yamlStr(slug),
        'description: ' + yamlStr(whenToUse),
        'whenToUse: ' + yamlStr(whenToUse),
        'metadata:',
        '  experience: true',
        '  scope: ' + scope,
        '  version: ' + version,
        '  created: ' + yamlStr(created),
      ]
      if (tags.length) lines.push('  tags: ' + yamlStr(tags.join(', ')))
      if (sessionRef) lines.push('  sessionRef: ' + yamlStr(sessionRef))
      lines.push('---', '', '# ' + title, '', '## 问题', '', problem, '', '## 解决方案', '', solution, '')
      if (context) lines.push('## 上下文与关键细节', '', context, '')
      lines.push('## 标签', '', tags.length ? tags.map((t) => '- ' + t).join('\n') : '（无）', '')
      lines.push('## 元数据', '', '- scope: ' + scope, '- version: ' + version, '- created: ' + created, sessionRef ? '- sessionRef: ' + sessionRef : null, '')
      lines.push('> 本经验由 `experience_capture` 计算生成，由模型的 `write` 工具落盘；经 dsh-skill-filesystem 热重载后跨会话/项目继承，可被 `experience_recall` 召回。')
      const content = lines.filter((x) => x !== null).join('\n') + '\n'

      // 目标路径：正式包有 Node，可给绝对路径
      const filePath = scope === 'project'
        ? path.join(findProjectRoot(ctx), '.dsh', 'skills', slug, 'SKILL.md')
        : path.join(dshHome(), 'skills', slug, 'SKILL.md')

      return {
        ok: true,
        skillName: slug,
        scope,
        version,
        path: filePath,
        content,
        nextAction: '用 `write` 工具在以上 `path` 落盘 `content`。`write` 触发 fs/observed，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。',
      }
    }

    // ---------- 经验召回 ----------
    async function recall(input: RecallInput): Promise<Json> {
      const query = String(input?.query || '').trim()
      const limit = Math.max(1, Math.min(50, Number(input?.limit) || 10))
      const out: Json = { query, skills: [], sessions: [], totalSkills: 0, sessionQueryAvailable: null as boolean | null }

      try {
        const all = await skills.list()
        const exps = all.filter((s: any) => (s.name && /^exp-/.test(s.name)) || (s.metadata && (s.metadata.experience === true || s.metadata.experience === 'true')))
        out.totalSkills = exps.length
        const q = query.toLowerCase()
        const words = q ? q.split(/\s+/).filter(Boolean) : []
        const matched = words.length === 0 ? exps : exps.filter((s: any) => {
          const hay = ((s.name || '') + ' ' + (s.description || '') + ' ' + (s.whenToUse || '')).toLowerCase()
          return words.some((w: string) => hay.indexOf(w) >= 0)
        })
        out.skills = matched.slice(0, limit).map((s: any) => ({ name: s.name, description: s.description, whenToUse: s.whenToUse, source: s.source }))
      } catch (e: any) { out.skillError = String(e?.message || e) }

      if (query) {
        try {
          const sq = ctx.get('sessionQuery')
          if (sq && typeof sq.searchSessions === 'function') {
            out.sessionQueryAvailable = true
            const page = await sq.searchSessions({ query, limit })
            const hits = (page && page.hits) || []
            out.sessions = hits.slice(0, limit).map((h: any) => {
              const bm = h.bestMatch || {}
              return { sessionId: h.sessionId, title: h.title, cwd: h.cwd, snippet: bm.snippet || h.snippet || '' }
            })
          } else {
            out.sessionQueryAvailable = false
          }
        } catch (e: any) { out.sessionError = String(e?.message || e) }
      }

      out.note = (out.sessions.length || out.skills.length)
        ? '已检索历史会话与既有经验技能。若要把某条历史会话蒸馏为技能，调用 experience_capture 并把 sessionRef 传入。'
        : '无匹配经验。可先用 experience_capture 沉淀当前任务的经验。'
      return out
    }

    // ---------- 列出经验技能 ----------
    async function listExperiences(): Promise<Json> {
      const result: Json = { ok: true, user: [], project: [], totalCount: 0 }
      try {
        const all = await skills.list()
        const exps = all.filter((s: any) => (s.name && /^exp-/.test(s.name)) || (s.metadata && (s.metadata.experience === true || s.metadata.experience === 'true')))
        for (const s of exps) {
          const bucket = (s.metadata && s.metadata.scope === 'project') ? 'project' : 'user'
          result[bucket].push({ name: s.name, description: s.description, whenToUse: s.whenToUse, source: s.source, scope: bucket })
        }
        result.totalCount = exps.length
      } catch (e: any) { result.error = String(e?.message || e) }
      return result
    }

    // ---------- 注册模型工具 ----------
    function renderText(value: unknown): string {
      try {
        const j = JSON.stringify(value, null, 2)
        return j.length > 8000 ? j.slice(0, 8000) + '\n...(truncated)' : j
      } catch (e) { return String(value) }
    }

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'experience_capture',
      description: 'Distill a reusable experience into a durable skill file that is inherited across sessions and projects. This tool COMPUTES the skill name, full SKILL.md content, and target path; you then write the file with your `write` tool (which hot-reloads the skill provider). Call this when you have just completed a goal, solved a hard problem, or found a workaround worth remembering.',
      parameters: {
        title: { type: 'string', required: true, description: 'Short title of the experience (becomes part of the skill name, kebab-cased, exp- prefixed)' },
        problem: { type: 'string', required: true, description: 'What problem/symptom was encountered; enough context to recognize it again' },
        solution: { type: 'string', required: true, description: 'What worked — the concrete steps, command, or reasoning that solved it' },
        context: { type: 'string', description: 'Optional: key details, gotchas, environment facts, error messages' },
        tags: { type: 'string', description: 'Comma-separated tags for later recall' },
        whenToUse: { type: 'string', description: 'Optional: when future tasks should reuse this' },
        scope: { type: 'string', enum: ['user', 'project'], description: 'user = global (default, ~/.dsh/skills); project = current project only' },
        sessionRef: { type: 'string', description: 'Optional: a dsh-session:<id> reference' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: renderText(v) }] },
      async execute(args: ExperienceInput) { return capture(args) },
    })))

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'experience_recall',
      description: 'Search past sessions (full-text) and existing experience skills for lessons relevant to the current task, BEFORE acting on a non-trivial task.',
      parameters: {
        query: { type: 'string', required: true, description: 'Whitespace-separated literal phrases describing the current task/problem' },
        limit: { type: 'integer', description: 'Max results per category (default 10, max 50)' },
      },
      output: { schema: { type: 'object', additionalProperties: true }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: renderText(v) }] },
      async execute(args: RecallInput) { return recall(args) },
    })))

    ctx.effect(() => ctx.tools.register(defineTool({
      name: 'experience_list',
      description: 'List all distilled experience skills currently visible to this session (global + project).',
      parameters: {},
      output: { schema: { type: 'object', additionalProperties: true }, render: (_a: unknown, v: unknown) => [{ type: 'text', text: renderText(v) }] },
      async execute() { return listExperiences() },
    })))

    // ---------- 运行时种子技能 ----------
    const learnSkill = {
      name: 'learn-experience',
      description: 'Self-evolution: use when you have just completed a goal, solved a non-trivial problem, discovered a reusable workaround, or learned something about this codebase/tooling that future sessions would benefit from. Distills the experience into a durable skill that is inherited across all sessions and projects.',
      whenToUse: 'After completing a goal; after solving a hard problem; after finding a non-obvious fix, workaround, or root cause; or when the user asks to "remember this".',
      content: LEARN_CONTENT,
    }
    const recallSkill = {
      name: 'recall-experience',
      description: 'Self-evolution: use at the start of a non-trivial task that resembles past work — searches past sessions (full-text) and existing experience skills for relevant lessons, so you can apply prior solutions instead of rediscovering them.',
      whenToUse: 'Before acting on a non-trivial task that resembles something you or a past session may have solved; before debugging a recurring symptom; when a task “feels familiar”.',
      content: RECALL_CONTENT,
    }
    ctx.effect(() => skills.register(learnSkill))
    ctx.effect(() => skills.register(recallSkill))

    // ---------- 扩展点：硬自动触发（需 host 组合 @deepseek-ai/dsh-system-prompt） ----------
    // 取消注释并注入 systemPrompt 服务后，每次组装系统提示都会插入一条常驻提醒，
    // 让模型在完成 goal / 解决难题后主动调用 learn-experience（真正的每轮硬触发）。
    //
    // const systemPrompt = ctx.get('systemPrompt')
    // if (systemPrompt && typeof systemPrompt.context === 'function') {
    //   ctx.effect(() => systemPrompt.context({
    //     name: 'experience-self-evolution',
    //     section: { kind: 'text', text:
    //       '## Self-evolution (standing reminder)\n' +
    //       'When you complete a goal, solve a non-trivial problem, or find a reusable workaround, ' +
    //       'invoke the `learn-experience` skill (or `experience_capture`) to distill it into an inherited skill. ' +
    //       'Before a non-trivial task that resembles past work, invoke `recall-experience` first.'
    //     },
    //   }))
    // }

    console.log('[experience] ready. dshHome=' + dshHome() + ' projectRoot=' + findProjectRoot(ctx) + ' sessionQuery=' + (!!ctx.get('sessionQuery')))
  },
}

const LEARN_CONTENT = [
  '# learn-experience — 经验沉淀（自我进化）',
  '',
  '本技能是 agent 自我进化闭环的“捕获触发器”。DSH 已把技能文件系统作为持久记忆：任何写入 `~/.dsh/skills/<name>/SKILL.md`（全局继承）或 `<projectRoot>/.dsh/skills/<name>/SKILL.md`（项目级）的技能，都会被 `dsh-skill-filesystem` 热重载，在下一个 pre-step 进入技能目录，被未来所有会话继承。',
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
  '**第 1 步：计算。** 调用 `experience_capture`，填写 title / problem / solution / context / tags / scope / sessionRef。',
  '工具返回 `{ skillName, scope, path, content, nextAction }`。同名经验自动版本递增（`exp-foo` → `exp-foo-v2`）。',
  '',
  '**第 2 步：落盘。** 用你的 `write` 工具，在 `path` 处写入 `content`。这一步触发 `fs/observed`，使技能 provider 立即失效并在下一个 pre-step 把本经验纳入目录。',
  '',
  '## scope 判据',
  '',
  '- `user`（默认，全局继承）：通用经验——与具体仓库无关的命令、流程、坑；',
  '- `project`（仅当前项目继承）：只对本仓库/本部署成立的经验。',
  '',
  '## 策展原则',
  '',
  '- 沉淀前先用 `experience_recall` 查是否已有相似经验，优先补充而非重复；',
  '- 经验是“写给未来的自己”的指令：用祈使句、给可复制的命令、标明前提条件；',
  '- 用 `experience_list` 审视已积累的经验，对过时的用 `edit`/删除其 SKILL.md 维护。',
].join('\n')

const RECALL_CONTENT = [
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
  '2. **历史会话片段**：来自 `ctx.sessionQuery`（若组合了 `@deepseek-ai/dsh-session-query-sqlite`）的相关会话摘录；可用 `@[标题](dsh-session:<id>)` 注入快照细读。',
  '',
  '## 召回后做什么',
  '',
  '- 对匹配的经验技能，用 `skill` 工具加载其完整正文并遵循；',
  '- 对相关历史会话，用会话引用注入快照细读；',
  '- 若当前任务解决了新问题，事后用 `learn-experience` 沉淀，闭环自我进化。',
  '',
  '> 若 `sessionQueryAvailable: false`，说明部署未组合全文检索后端，此时仅召回已沉淀的经验技能。',
].join('\n')
