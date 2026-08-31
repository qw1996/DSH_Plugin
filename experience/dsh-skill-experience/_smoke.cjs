// 功能性冒烟：调用 capture / recall / list，检查产出形态。给桩注入 skills + sessionQuery。
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, 'host.js'), 'utf8')
const factory = new Function(src)()

const tools = []
globalThis.harness = {
  defineTool(opt) { tools.push(opt); return opt },
  registerTool(_ctx, _t) { return () => {} },
}

// 桩 skills：list 返回两条（一条 exp- 已存在以触发版本递增），register 接受
const registered = []
const skillsStub = {
  list() { return Promise.resolve([
    { name: 'exp-fix-ssh', description: '当遇到与「fix ssh」相似的任务时使用', whenToUse: 'x', source: 'user-dsh', metadata: { experience: true, scope: 'user' } },
    { name: 'other-skill', description: 'unrelated', source: 'runtime' },
  ]) },
  register(s) { registered.push(s.name); return () => {} },
}
const sessionQueryStub = {
  searchSessions(req) { return Promise.resolve({ hits: [{ sessionId: 's1', title: 'ssh debug', cwd: '/x', bestMatch: { snippet: '...ssh -vvv...' } }] }) },
}
const ctx = {
  effect(fn) { try { fn() } catch (e) { console.error('effect err', e.message) } return () => {} },
  get(k) { if (k === 'skills') return skillsStub; if (k === 'sessionQuery') return sessionQueryStub; return undefined },
}

factory.apply(ctx)
const byName = {}
for (const t of tools) byName[t.name] = t

;(async () => {
  // capture：同名 exp-fix-ssh 已存在 → 应得 exp-fix-ssh-v2
  const cap = await byName.experience_capture.execute({
    title: 'Fix SSH', problem: 'SSH免密失败', solution: '检查authorized_keys权限', context: '注意.ssh权限700', tags: 'ssh,ops', scope: 'user'
  })
  console.log('=== capture result ===')
  console.log('skillName:', cap.skillName, '| version:', cap.version, '| scope:', cap.scope)
  console.log('path:', cap.path)
  console.log('--- content ---')
  console.log(cap.content)
  console.log('--- nextAction ---')
  console.log(cap.nextAction)

  console.log('\n=== recall result ===')
  const rec = await byName.experience_recall.execute({ query: 'ssh 权限', limit: 5 })
  console.log(JSON.stringify(rec, null, 2))

  console.log('\n=== list result ===')
  const list = await byName.experience_list.execute({})
  console.log(JSON.stringify(list, null, 2))

  console.log('\nregistered seeds:', registered.join(', '))
  console.log('\nFUNCTIONAL OK')
})().catch((e) => { console.error('FUNC FAIL:', e.stack || e); process.exit(1) })
