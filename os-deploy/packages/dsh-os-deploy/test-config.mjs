// host 侧配置/状态迁移/保留期清扫 功能测试（stub ctx 直测服务类）
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const mod = await import('./lib/index.js')
const Svc = mod.default

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osd-cfg-'))
console.log('临时根:', tmp)

// stub ctx：workspaceRoot 指向临时目录（补 reflect.provide 满足 cordis Service 构造）
const mk = (dir) => ({ get: () => ({ workspaceRoot: dir }), on: () => {}, reflect: { provide: () => {} } })
const ctx = mk(tmp)
const svc = new Svc(ctx)

// 1. 默认配置
const cfg1 = await svc.getConfig()
console.log('默认 storageRoot:', cfg1.config.storageRoot, ' 保留:', cfg1.config.taskRetentionDays, '天')
if (cfg1.config.storageRoot !== path.join(tmp, 'osdeploy-data')) throw new Error('默认根错误')
if (cfg1.config.taskRetentionDays !== 7) throw new Error('默认保留期错误')

// 2. 状态懒加载：未调用任何方法前不产生 state 文件
if (fs.existsSync(path.join(tmp, 'dsh-os-deploy-state.json'))) throw new Error('启动即读状态！')

// 3. setConfig 换根
const r1 = await svc.setConfig({ storageRoot: path.join(tmp, 'D-data'), taskRetentionDays: 30 })
if (!r1.ok) throw new Error('setConfig 失败: ' + r1.error)
console.log('新根:', r1.config.storageRoot, ' 保留:', r1.config.taskRetentionDays, '天')
if (!fs.existsSync(path.join(tmp, 'D-data'))) throw new Error('新根未创建')

// 4. 注册镜像 → 状态落到新根
const reg = await svc.registerIso({ name: 'test', vendor: 'kylin', isoPath: 'X:\\nonexistent.iso' })
if (reg.ok) throw new Error('不存在的 ISO 竟然注册成功？')
// 用真实小文件注册
const fakeIso = path.join(tmp, 'fake.iso')
fs.writeFileSync(fakeIso, 'x')
const reg2 = await svc.registerIso({ name: 't', vendor: 'kylin', isoPath: fakeIso })
if (!reg2.ok) throw new Error('注册失败: ' + reg2.error)
const stateNew = path.join(tmp, 'D-data', 'state.json')
if (!fs.existsSync(stateNew)) throw new Error('状态未写入新根！')
console.log('状态已落新根:', stateNew)

// 5. 旧版状态迁移：在 workspace 根放旧 state → ensureState 迁移
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'osd-mig-'))
const legacyState = { images: [], tasks: [{ id: 't_old', imageId: '', device: { bmcHost: '1.1.1.1', osIp: '2.2.2.2' }, components: [], status: 'success', createdAt: 1, startedAt: 1, finishedAt: 2, progress: 100, stage: 'done', logs: [], error: null, queueKey: 'k' }] }
fs.writeFileSync(path.join(tmp2, 'dsh-os-deploy-state.json'), JSON.stringify(legacyState))
const svc2 = new Svc(mk(tmp2))
const imgs = await svc2.listImages()
const sts = await svc2.listTasks()
if (sts.tasks.length !== 1 || sts.tasks[0].id !== 't_old') throw new Error('迁移失败：旧任务未读出')
if (!fs.existsSync(path.join(tmp2, 'osdeploy-data', 'state.json'))) throw new Error('迁移后新位置无 state')
if (fs.existsSync(path.join(tmp2, 'dsh-os-deploy-state.json'))) throw new Error('旧 state 未改名')
console.log('旧状态迁移 OK（旧文件 → .migrated，任务 t_old 保留）')

// 6. 保留期清扫：把 t_old 的 finishedAt 设为 8 天前（保留 7 天）
const st = JSON.parse(fs.readFileSync(path.join(tmp2, 'osdeploy-data', 'state.json'), 'utf8'))
st.tasks[0].finishedAt = Date.now() - 8 * 86400000
fs.writeFileSync(path.join(tmp2, 'osdeploy-data', 'state.json'), JSON.stringify(st))
const svc3 = new Svc(mk(tmp2))
await svc3.listTasks()
svc3.sweepExpiredTasksPublic ? svc3.sweepExpiredTasksPublic() : (svc3).sweepExpiredTasks()
const sts3 = await svc3.listTasks()
if (sts3.tasks.length !== 0) throw new Error('过期任务未清扫')
console.log('8 天前完成的任务已被清扫 OK')

// 7. 保留 0 天 = 不清扫
const svc4 = new Svc(mk(tmp2))
await svc4.setConfig({ taskRetentionDays: 0 })
fs.writeFileSync(path.join(tmp2, 'osdeploy-data', 'state.json'), JSON.stringify({ images: [], tasks: [{ ...legacyState.tasks[0], finishedAt: Date.now() - 99 * 86400000 }] }))
const svc5 = new Svc(mk(tmp2))
await svc5.listTasks()
;(svc5).sweepExpiredTasks()
const sts5 = await svc5.listTasks()
if (sts5.tasks.length !== 1) throw new Error('保留0天不应清扫')
console.log('保留 0 天 = 永久保留 OK')

// 清理
fs.rmSync(tmp, { recursive: true, force: true })
fs.rmSync(tmp2, { recursive: true, force: true })
console.log('\n全部通过 OK')
