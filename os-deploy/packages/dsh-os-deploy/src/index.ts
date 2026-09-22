// dsh-os-deploy —— Host 半：OS 自动化部署后端 Service
// 提供服务 `osDeploy`（@Remote 方法供浏览器 UI 调用），持有镜像管理/任务队列/部署引擎。
import { Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import type {
  IsoImage, DeployTask, TargetDevice, InstallComponent,
  RegisterIsoRequest, RegisterIsoResult,
  ListImagesResult, ListTasksResult,
  CreateTaskRequest, CreateTaskResult,
  GetTaskDetailRequest, GetTaskDetailResult,
  CancelTaskRequest, CancelTaskResult,
  DeleteTaskRequest, DeleteTaskResult,
  ListComponentsRequest, ListComponentsResult,
  ProbeDeviceRequest, ProbeDeviceResult,
  ExtractImageRequest, ExtractImageResult,
  DeleteImageRequest, DeleteImageResult,
  GetServerListResult,
  ServiceStatusResult, ServiceControlResult,
  BrowsePathRequest, BrowsePathResult, FileEntry,
  OsDeployConfig, GetConfigResult, SetConfigRequest, SetConfigResult,
} from './types'
import {
  RedfishClient, DeployHttpServer, DeployRunner, DeploySpec, SyslogCollector,
  extractIso, genKickstart, genPreseed, getRouteIp,
} from './engine'
import { DEFAULT_TLS_CERT, DEFAULT_TLS_KEY } from './certs'

type Json = any

const HTTP_PORT = 8080
/** 虚拟光驱 HTTPS 端口（iBMC 要求 https:// 镜像 URL；443 免端口后缀） */
const HTTPS_PORT = 443
/** 安装器 syslog 接收端口（rd.syslog/inst.remotelog 推送） */
const SYSLOG_PORT = 514

const COMPONENTS: Record<string, InstallComponent[]> = {
  openEuler: [
    { id: 'core', name: '最小化安装', description: '@core + SSH + 基本工具', packages: ['@core', 'openssh-server', 'curl', 'wget', 'tar'] },
    { id: 'ssh-server', name: 'SSH 服务器', description: 'openssh-server（最小化已含）', packages: ['openssh-server'] },
    { id: 'devel', name: '开发工具', description: 'GCC / G++ / Make / GDB / Git', packages: ['@development', 'gcc', 'gcc-c++', 'make', 'gdb', 'git'] },
    { id: 'minimal-extra', name: '常用工具', description: 'vim / net-tools / bind-utils', packages: ['vim', 'net-tools', 'bind-utils'] },
  ],
  kylin: [
    { id: 'core', name: '最小化安装', description: '@core + SSH + 基本工具', packages: ['@core', 'openssh-server', 'curl', 'wget', 'tar'] },
    { id: 'ssh-server', name: 'SSH 服务器', description: 'openssh-server（最小化已含）', packages: ['openssh-server'] },
    { id: 'devel', name: '开发工具', description: 'GCC / G++ / Make / GDB / Git', packages: ['@development', 'gcc', 'gcc-c++', 'make', 'gdb', 'git'] },
    { id: 'minimal-extra', name: '常用工具', description: 'vim / net-tools / bind-utils', packages: ['vim', 'net-tools', 'bind-utils'] },
  ],
  debian: [
    { id: 'core', name: '最小化安装', description: 'base + SSH + curl', packages: ['openssh-server', 'curl'] },
    { id: 'ssh-server', name: 'SSH 服务器', description: 'openssh-server', packages: ['openssh-server'] },
    { id: 'devel', name: '开发工具', description: 'build-essential / GCC / Make / GDB / Git', packages: ['build-essential', 'gcc', 'make', 'gdb', 'git'] },
  ],
}

export default class OsDeployService extends TypertRemoteService {
  static inject = ['timer', 'subprocess', 'fs', 'sandboxPolicy']

  images: IsoImage[] = []
  tasks: Map<string, DeployTask> = new Map()
  /** 部署服务（HTTP 仓库 + 任务队列）是否处于运行态；默认 false，避免拖慢 DSH 启动 */
  serverRunning = false
  serverStartedAt: number | null = null
  private httpServer: DeployHttpServer | null = null
  private runners: Map<string, DeployRunner> = new Map()
  /** 安装器 syslog 收集（rd.syslog/inst.remotelog → 实时安装日志） */
  private syslog: SyslogCollector | null = null
  /** BMC 拉盘请求计数（节流日志用） */
  private isoFetchCount = 0
  /** 每任务已装 RPM 计数（逐包日志 + 进度映射） */
  private rpmCounts: Map<string, number> = new Map()
  /** 每任务已记录过的仓库元数据/install.img（去重） */
  private repoSeen: Map<string, number> = new Map()
  /** syslog 入任务日志的节流时间戳 */
  private lastSyslogAt = 0
  private root: string | null = null
  /** 状态懒加载：DSH web 启动阶段零读盘零日志，首次实际使用才加载 */
  private stateLoaded = false
  /** 任务保留期清扫定时器（服务运行期间每小时一次） */
  private sweepTimer: NodeJS.Timeout | null = null
  private cfg: OsDeployConfig = { storageRoot: '', taskRetentionDays: 7 }
  private cfgFile: string | null = null
  private queueRunning = false

  constructor(ctx: any) {
    super(ctx, 'osDeploy')
    const sp = ctx.get('sandboxPolicy')
    if (sp && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) {
      this.root = sp.workspaceRoot.replace(/[\\/]+$/, '')
    }
    // 配置文件极小（百字节级），放 workspace 根以便定位数据根目录；
    // 状态/任务/镜像数据全部延迟到实际使用时才读（启动零动作）。
    this.cfgFile = this.root ? path.join(this.root, 'dsh-os-deploy-config.json') : null
    this.loadConfig()
    // cordis Service 没有 [Service.dispose] 符号（服务随 fiber 自动注销），
    // 清理逻辑挂在 Context 的 dispose 事件上。
    ctx.on('dispose', () => {
      if (this.httpServer) this.httpServer.stop()
      if (this.syslog) this.syslog.stop()
      if (this.sweepTimer) clearInterval(this.sweepTimer)
      for (const [, r] of this.runners) r.cancel()
    })
  }

  // ---------- 存储路径（全部汇聚到可配置的 storageRoot） ----------
  private get storageRoot(): string {
    return this.cfg.storageRoot || path.join(this.root || process.cwd(), 'osdeploy-data')
  }
  private repoDirOf(distroId: string) { return path.join(this.storageRoot, 'repo', distroId) }
  private isoDirPath() { return path.join(this.storageRoot, 'iso') }
  taskDirOf(taskId: string) { return path.join(this.storageRoot, 'tasks', taskId) }
  private logsDirPath() { return path.join(this.storageRoot, 'logs') }
  private statePath() { return path.join(this.storageRoot, 'state.json') }
  /** 升级前的旧数据根（存在则提示可迁移/清理） */
  private legacyRoot(): string | null {
    const legacy = this.root ? path.join(this.root, 'os-deploy-repo') : null
    return legacy && fs.existsSync(legacy) ? this.root : null
  }

  private loadConfig() {
    if (!this.cfgFile || !fs.existsSync(this.cfgFile)) return
    try {
      const raw = JSON.parse(fs.readFileSync(this.cfgFile, 'utf8'))
      if (typeof raw.storageRoot === 'string' && raw.storageRoot) this.cfg.storageRoot = raw.storageRoot
      if (typeof raw.taskRetentionDays === 'number' && raw.taskRetentionDays >= 0) this.cfg.taskRetentionDays = raw.taskRetentionDays
    } catch { /* 配置损坏则用默认值 */ }
  }

  private saveConfig() {
    if (!this.cfgFile) return
    try { fs.writeFileSync(this.cfgFile, JSON.stringify(this.cfg, null, 2), 'utf8') } catch { /* ignore */ }
  }

  /** 状态懒加载（含旧版 state.json 迁移到 storageRoot） */
  private ensureState() {
    if (this.stateLoaded) return
    this.stateLoaded = true
    const readState = (file: string) => {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      this.images = data.images || []
      this.tasks = new Map()
      for (const t of (data.tasks || [])) this.tasks.set(t.id, t)
    }
    try {
      const p = this.statePath()
      if (fs.existsSync(p)) { readState(p); return }
      // 迁移：旧版状态在 workspace 根
      const legacy = this.root ? path.join(this.root, 'dsh-os-deploy-state.json') : null
      if (legacy && fs.existsSync(legacy)) {
        readState(legacy)
        this.save()
        try { fs.renameSync(legacy, legacy + '.migrated') } catch { /* ignore */ }
      }
    } catch { /* 状态损坏则从空开始 */ }
  }

  // ---------- @Remote: 配置 ----------
  @Remote('getConfig')
  async getConfig(): Promise<GetConfigResult> {
    return { config: { storageRoot: this.storageRoot, taskRetentionDays: this.cfg.taskRetentionDays }, legacyRoot: this.legacyRoot() }
  }

  @Remote('setConfig')
  async setConfig(req: SetConfigRequest): Promise<SetConfigResult> {
    try {
      if (req.storageRoot !== undefined) {
        const p = req.storageRoot.trim()
        if (!p) return { ok: false, error: '存储路径不能为空' }
        // 尝试创建目录验证可写性
        fs.mkdirSync(p, { recursive: true })
        this.cfg.storageRoot = p
      }
      if (req.taskRetentionDays !== undefined) {
        const d = Math.floor(Number(req.taskRetentionDays))
        if (!Number.isFinite(d) || d < 0 || d > 3650) return { ok: false, error: '保留天数需为 0-3650（0 = 不自动删除）' }
        this.cfg.taskRetentionDays = d
      }
      this.saveConfig()
      // 状态文件随根迁移（已加载的内存状态写到新位置）
      if (this.stateLoaded) this.save()
      return { ok: true, config: { storageRoot: this.storageRoot, taskRetentionDays: this.cfg.taskRetentionDays } }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  // ---------- @Remote: 服务控制 ----------
  @Remote('serviceStatus')
  async serviceStatus(): Promise<ServiceStatusResult> {
    this.ensureState()
    return {
      running: this.serverRunning,
      port: HTTP_PORT,
      startedAt: this.serverStartedAt,
      imageCount: this.images.length,
      taskCount: this.tasks.size,
      activeTaskCount: Array.from(this.tasks.values())
        .filter(t => t.status === 'running' || t.status === 'queued').length,
    }
  }

  @Remote('serviceStart')
  async serviceStart(): Promise<ServiceControlResult> {
    try {
      if (this.serverRunning) return { ok: true, status: await this.serviceStatus() }
      this.ensureState()
      this.httpServer = new DeployHttpServer(HTTP_PORT, HTTPS_PORT)
      this.httpServer.onReport((query, ip) => this.handleReport(query, ip))
      // 全路径访问观测：/iso 的 BMC 拉盘 + /repo 的安装器取包（逐包日志）
      this.isoFetchCount = 0
      this.httpServer.onAccess(({ path: p, method, status, bytes, ip }) => this.onRepoAccess(p, method, status, bytes, ip))
      // 虚拟光驱镜像目录（HTTPS /iso 根）与 TLS 证书
      fs.mkdirSync(this.isoDirPath(), { recursive: true })
      this.httpServer.setRoot('/iso', this.isoDirPath())
      const tls = this.ensureTls()
      await this.httpServer.start(tls)
      // 安装器实时日志（rd.syslog/inst.remotelog 推送，UDP+TCP 514）
      fs.mkdirSync(this.logsDirPath(), { recursive: true })
      this.syslog = new SyslogCollector(SYSLOG_PORT, path.join(this.logsDirPath(), 'syslog.log'))
      this.syslog.onLine = ({ ip, msg }) => this.onSyslogLine(ip, msg)
      try {
        await this.syslog.start()
      } catch (e: any) {
        this.syslog = null
        this.addSvcNote(`syslog :${SYSLOG_PORT} 监听失败（${e?.message || e}）——安装器实时日志不可用`)
      }
      // 为已解包的镜像重新注册 HTTP 根
      for (const img of this.images) {
        if (img.extracted && img.extractedDir) this.httpServer.setRoot(`/repo/${img.distroId}`, img.extractedDir)
      }
      if (!this.httpServer.httpsUp) {
        this.addSvcNote(`HTTPS :${HTTPS_PORT} 未就绪（${this.httpServer.httpsError}）——虚拟光驱挂载将失败`)
      }
      this.serverRunning = true
      this.serverStartedAt = Date.now()
      console.log(`[osdeploy] service started: storage=${this.storageRoot} HTTP:${HTTP_PORT} HTTPS:${HTTPS_PORT}`)
      // 任务保留期清扫（启动时一次 + 每小时一次）
      this.sweepExpiredTasks()
      if (this.sweepTimer) clearInterval(this.sweepTimer)
      this.sweepTimer = setInterval(() => this.sweepExpiredTasks(), 60 * 60 * 1000)
      // 恢复队列中排队的任务
      this.processQueue()
      return { ok: true, status: await this.serviceStatus() }
    } catch (e: any) {
      this.httpServer = null
      return { ok: false, error: String(e?.message || e) }
    }
  }

  /** /iso 与 /repo 访问观测——安装过程的关键遥测 */
  private onRepoAccess(p: string, method: string, status: number, bytes: number, ip: string) {
    try {
      if (p.startsWith('/iso/')) {
        // BMC 以大量小 Range 请求流式拉盘，节流记录
        this.isoFetchCount++
        if (this.isoFetchCount === 1 || this.isoFetchCount % 100 === 0) {
          console.log(`[osdeploy] virtual CD fetch #${this.isoFetchCount}: ${method} ${status} from ${ip}`)
          const task = this.runningTaskBy(ip, 'bmcHost')
          if (task) this.addLog(task, 'info', `虚拟光驱被 BMC 拉取 (req #${this.isoFetchCount}: ${method} ${status})`)
        }
        return
      }
      if (!p.startsWith('/repo/')) return
      const task = this.runningTaskBy(ip, 'osIp')
      if (!task) return
      // stage2 安装器镜像（slim 模式从 HTTP 拉，可能分多段）
      if (/install\.img$/i.test(p)) {
        const seen = this.repoSeen.get(task.id + ':install.img')
        if (!seen) {
          this.repoSeen.set(task.id + ':install.img', 1)
          this.addLog(task, 'info', '正在加载安装器 stage2 (install.img)')
          task.stage = 'stage2-loading'
        }
        return
      }
      // 逐包：每个 RPM 一条日志（用户要求看到"正在安装什么包"）
      if (/\.rpm$/i.test(p)) {
        const n = (this.rpmCounts.get(task.id) || 0) + 1
        this.rpmCounts.set(task.id, n)
        const pkg = (p.split('/').pop() || '').replace(/\.rpm$/i, '')
        this.addLog(task, 'info', `安装软件包 #${n}: ${pkg}`)
        task.stage = 'installing-rpms'
        task.progress = Math.max(task.progress, Math.min(45 + Math.floor(n * 0.12), 85))
        return
      }
      // 仓库元数据（repomd/comps/treeinfo——去重）
      const key = task.id + ':meta:' + p
      if (!this.repoSeen.has(key)) {
        this.repoSeen.set(key, 1)
        const meta = p.split('/').pop() || p
        this.addLog(task, 'info', `加载仓库元数据: ${meta}`)
        task.stage = 'repo-metadata'
      }
    } catch { /* 观测日志失败不影响服务 */ }
  }

  /** 安装器 syslog 行 → 过滤关键事件入任务日志（全量原文已落盘 syslog.log） */
  private onSyslogLine(ip: string, msg: string) {
    try {
      const l = msg.replace(/\s+/g, ' ').trim()
      if (!l) return
      const task = this.runningTaskBy(ip, 'osIp')
      if (!task) return
      // 全量原文落盘到任务目录（anaconda.log）——不受过滤/节流限制
      try {
        fs.appendFileSync(path.join(this.taskDirOf(task.id), 'anaconda.log'), `${new Date().toISOString()} ${l}\n`, 'utf8')
      } catch { /* 任务目录可能尚未创建 */ }
      const notable = /error|traceback|terminate|fatal|fail|exception|storage|kickstart|payload|metadata|partition|mounting|installing|transaction|bootload|multipath|blivet|started|finished|anaconda|network|dhcp|addr|dnf|rpm/i.test(l)
      if (!notable) return
      const now = Date.now()
      if (now - this.lastSyslogAt < 1500) return  // 节流：最多 1 条/1.5s
      this.lastSyslogAt = now
      this.addLog(task, 'info', `[anaconda] ${l.slice(0, 260)}`)
    } catch { /* ignore */ }
  }

  private runningTaskBy(ip: string, field: 'osIp' | 'bmcHost') {
    for (const [, t] of this.tasks) {
      if (t.status === 'running' && (t.device as any)[field] === ip) return t
    }
    return null
  }

  /** 确保 <root>/certs/ 下有 TLS 证书（虚拟光驱 HTTPS 用）；缺失则落盘内嵌默认自签对。 */
  private ensureTls(): { cert: string; key: string } | undefined {
    try {
      const dir = path.join(this.root || process.cwd(), 'certs')
      const crt = path.join(dir, 'server.crt')
      const key = path.join(dir, 'server.key')
      if (!fs.existsSync(crt) || !fs.existsSync(key)) {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(crt, DEFAULT_TLS_CERT, 'utf8')
        fs.writeFileSync(key, DEFAULT_TLS_KEY, 'utf8')
        console.log('[osdeploy] wrote default self-signed TLS cert for virtual media HTTPS')
      }
      return { cert: fs.readFileSync(crt, 'utf8'), key: fs.readFileSync(key, 'utf8') }
    } catch (e: any) {
      console.error('[osdeploy] TLS cert setup failed:', e?.message || e)
      return undefined
    }
  }

  private addSvcNote(note: string) {
    console.warn(`[osdeploy] ${note}`)
  }

  @Remote('serviceStop')
  async serviceStop(): Promise<ServiceControlResult> {
    try {
      // 取消所有活动 runner（BMC 操作尽快停下）
      for (const [, r] of this.runners) r.cancel()
      this.runners.clear()
      // 排队任务 → cancelled；运行中任务 → failed
      for (const [, t] of this.tasks) {
        if (t.status === 'queued') { t.status = 'cancelled'; t.finishedAt = Date.now() }
        else if (t.status === 'running') { t.status = 'failed'; t.error = '服务已停止'; t.finishedAt = Date.now() }
      }
      this.queueRunning = false
      if (this.httpServer) { this.httpServer.stop(); this.httpServer = null }
      if (this.syslog) { this.syslog.stop(); this.syslog = null }
      if (this.sweepTimer) { clearInterval(this.sweepTimer); this.sweepTimer = null }
      this.serverRunning = false
      this.serverStartedAt = null
      this.rpmCounts.clear()
      this.repoSeen.clear()
      this.save()
      console.log('[osdeploy] service stopped')
      return { ok: true, status: await this.serviceStatus() }
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) }
    }
  }

  @Remote('serviceRestart')
  async serviceRestart(): Promise<ServiceControlResult> {
    await this.serviceStop()
    return this.serviceStart()
  }

  // ---------- 持久化 ----------
  private save() {
    try {
      fs.mkdirSync(this.storageRoot, { recursive: true })
      fs.writeFileSync(this.statePath(), JSON.stringify({
        images: this.images,
        tasks: Array.from(this.tasks.values()),
      }, null, 2))
    } catch (e) { console.error('[osdeploy] save state error:', e) }
  }

  /** 终态任务保留期清扫：到期任务连同任务目录一起删除 */
  private sweepExpiredTasks() {
    if (this.cfg.taskRetentionDays <= 0) return
    const cutoff = Date.now() - this.cfg.taskRetentionDays * 86400000
    const expired: string[] = []
    for (const [id, t] of this.tasks) {
      if (t.status === 'queued' || t.status === 'running') continue
      const end = t.finishedAt || t.createdAt
      if (end && end < cutoff) expired.push(id)
    }
    for (const id of expired) {
      const t = this.tasks.get(id)
      this.tasks.delete(id)
      this.removeTaskDir(id)
      if (t) console.log(`[osdeploy] task ${id} expired after ${this.cfg.taskRetentionDays}d (auto-removed)`)
    }
    if (expired.length) this.save()
  }

  /** 删除任务目录（详细安装日志等）与迷你 ISO 残留 */
  private removeTaskDir(taskId: string) {
    try {
      const dir = this.taskDirOf(taskId)
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
      const iso = path.join(this.isoDirPath(), `${taskId}.iso`)
      if (fs.existsSync(iso)) fs.rmSync(iso, { force: true })
      this.rpmCounts.delete(taskId)
      for (const k of Array.from(this.repoSeen.keys())) {
        if (k.startsWith(taskId + ':')) this.repoSeen.delete(k)
      }
    } catch { /* 清理失败不影响主流程 */ }
  }

  // ---------- @Remote: 镜像管理 ----------
  @Remote('listServers')
  async listServers(): Promise<GetServerListResult> {
    // Try to get servers from server-manager plugin's inventory
    try {
      const invFile = this.root ? path.join(this.root, 'dsh-server-inventory.json') : null
      if (invFile && fs.existsSync(invFile)) {
        const data = JSON.parse(fs.readFileSync(invFile, 'utf8'))
        const servers = (data.servers || data || []).map((s: any) => ({
          id: s.id || s.host,
          name: s.name || s.host,
          host: s.host || s.sshHost || '',
          bmcHost: s.bmcHost || s.bmc_host || '',
          bmcUser: s.bmcUser || s.bmc_user || '',
          sshUser: s.sshUser || 'root',
        }))
        return { servers }
      }
    } catch (e) { /* ignore */ }
    return { servers: [] }
  }

  // ---------- @Remote: 文件浏览（镜像选择弹窗） ----------
  /** 列出可用根：win32 枚举存在的盘符，其余平台返回 '/'。 */
  private listRoots(): string[] {
    if (process.platform === 'win32') {
      const out: string[] = []
      for (let c = 65; c <= 90; c++) {
        const drive = String.fromCharCode(c) + ':\\'
        try { fs.accessSync(drive); out.push(drive) } catch { /* 盘符不存在 */ }
      }
      return out
    }
    return ['/']
  }

  /**
   * 浏览目录：返回子目录与文件（含大小），供面板「选择 ISO」弹窗使用。
   * 无 path 时从用户主目录开始；不可读目录返回 error（面包屑仍可回退）。
   * 单层最多返回 2000 条（truncated 标记），防御超大目录拖慢 UI。
   */
  @Remote('browsePath')
  async browsePath(req: BrowsePathRequest): Promise<BrowsePathResult> {
    const home = os.homedir()
    const roots = this.listRoots()
    const empty = (p: string, err?: string): BrowsePathResult => ({
      path: p, parent: null, home, roots, entries: [], truncated: false, error: err,
    })
    try {
      let target = req.path && req.path.trim() ? path.resolve(req.path.trim()) : home
      let st = fs.statSync(target)
      if (!st.isDirectory()) target = path.dirname(target)
      const parent = path.dirname(target) === target ? null : path.dirname(target)
      const dirents = fs.readdirSync(target, { withFileTypes: true })
      const entries: FileEntry[] = []
      for (const d of dirents) {
        const full = path.join(target, d.name)
        let isDir = d.isDirectory()
        let sizeBytes: number | null = null
        try {
          const s2 = fs.statSync(full) // 符号链接跟随目标
          isDir = s2.isDirectory()
          if (!isDir) sizeBytes = s2.size
        } catch { /* 断链/不可读 → 仍列出目录项，跳过属性 */ }
        entries.push({ name: d.name, path: full, isDir, sizeBytes })
        if (entries.length >= 2000) break
      }
      const truncated = entries.length >= 2000 && dirents.length > entries.length
      entries.sort((a, b) => (a.isDir === b.isDir) ? a.name.localeCompare(b.name) : (a.isDir ? -1 : 1))
      return { path: target, parent, home, roots, entries, truncated }
    } catch (e: any) {
      return empty(home, String(e?.message || e))
    }
  }

  @Remote('registerIso')
  async registerIso(req: RegisterIsoRequest): Promise<RegisterIsoResult> {
    this.ensureState()
    try {
      if (!req.isoPath || !fs.existsSync(req.isoPath)) {
        return { ok: false, error: `ISO file not found: ${req.isoPath}` }
      }
      if (!['openEuler', 'kylin', 'debian'].includes(req.vendor)) {
        return { ok: false, error: `Unsupported vendor: ${req.vendor} (openEuler/kylin/debian)` }
      }
      const stat = fs.statSync(req.isoPath)
      const id = 'img_' + crypto.randomBytes(6).toString('hex')
      const distroId = path.basename(req.isoPath, '.iso').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
      const image: IsoImage = {
        id, name: req.name || path.basename(req.isoPath),
        vendor: req.vendor as any, isoPath: req.isoPath,
        distroId, extractedDir: null, extracted: false,
        sizeBytes: stat.size, registeredAt: Date.now(),
      }
      this.images.push(image)
      this.save()
      return { ok: true, image }
    } catch (e: any) { return { ok: false, error: String(e.message || e) } }
  }

  @Remote('extractImage')
  async extractImage(req: ExtractImageRequest): Promise<ExtractImageResult> {
    this.ensureState()
    const img = this.images.find(i => i.id === req.imageId)
    if (!img) return { ok: false, error: 'image not found' }
    if (img.extracted && img.extractedDir) return { ok: true }
    const outDir = this.repoDirOf(img.distroId)
    const result = extractIso(img.isoPath, outDir)
    if (result.ok) {
      img.extracted = true
      img.extractedDir = outDir
      // Register HTTP root
      if (this.httpServer) this.httpServer.setRoot(`/repo/${img.distroId}`, outDir)
      this.save()
      return { ok: true }
    }
    return { ok: false, error: result.error || 'extraction failed' }
  }

  @Remote('deleteImage')
  async deleteImage(req: DeleteImageRequest): Promise<DeleteImageResult> {
    this.ensureState()
    const idx = this.images.findIndex(i => i.id === req.imageId)
    if (idx < 0) return { ok: false, error: 'image not found' }
    const img = this.images[idx]
    const running = Array.from(this.tasks.values()).some(t => t.status === 'running' && t.imageId === img.id)
    if (running) return { ok: false, error: '该镜像有正在运行的安装任务，请先等任务结束' }
    if (this.httpServer) this.httpServer.removeRoot(`/repo/${img.distroId}`)
    // 同步删除解包目录（可能高达数十 GB——原版只摘除 HTTP 根、目录残留）
    if (img.extractedDir && fs.existsSync(img.extractedDir)) {
      try {
        fs.rmSync(img.extractedDir, { recursive: true, force: true })
        console.log(`[osdeploy] removed extracted repo: ${img.extractedDir}`)
      } catch (e: any) {
        console.error(`[osdeploy] failed to remove extracted repo: ${e?.message || e}`)
      }
    }
    this.images.splice(idx, 1)
    this.save()
    return { ok: true }
  }

  @Remote('listImages')
  async listImages(): Promise<ListImagesResult> {
    this.ensureState()
    return { images: this.images }
  }

  // ---------- @Remote: 组件列表 ----------
  @Remote('listComponents')
  async listComponents(req: ListComponentsRequest): Promise<ListComponentsResult> {
    return { components: COMPONENTS[req.vendor] || [] }
  }

  // ---------- @Remote: 设备探测 ----------
  @Remote('probeDevice')
  async probeDevice(req: ProbeDeviceRequest): Promise<ProbeDeviceResult> {
    try {
      const rf = new RedfishClient({ host: req.bmcHost, user: req.bmcUser, pass: req.bmcPassword })
      const sys = await rf.getSystem()
      const storages = await rf.getStorage()
      const disks: any[] = []
      let nicMac = ''
      if (storages) {
        for (const s of storages) {
          for (const d of (s.driveDetails || [])) {
            disks.push({
              id: d.Id || '',
              name: d.Name || d.Id || '',
              serial: (d.SerialNumber || '').trim(),
              capacityBytes: d.CapacityBytes || 0,
              media: d.MediaType || 'HDD',
              protocol: d.Protocol || '',
            })
          }
        }
      }
      // 回退：Systems/Storage 不可用（如鲲鹏 iBMC 404）时从 Chassis/Drives 枚举
      if (disks.length === 0) {
        const drives = await rf.getChassisDrives()
        for (const d of drives) {
          disks.push({
            id: d.Id || '',
            name: d.Name || d.Id || '',
            serial: (d.SerialNumber || '').trim(),
            capacityBytes: d.CapacityBytes || 0,
            media: d.MediaType || 'HDD',
            protocol: d.Protocol || '',
          })
        }
      }
      // Try to get NIC info from EthernetInterfaces
      try {
        const eth = await rf.get('/redfish/v1/Systems/1/EthernetInterfaces')
        if (eth.status === 200 && eth.json.Members) {
          const first = await rf.get(eth.json.Members[0]['@odata.id'])
          if (first.status === 200) nicMac = first.json.MACAddress || ''
        }
      } catch (e) { /* ignore */ }
      return {
        ok: true,
        model: sys.Model || '',
        serial: sys.SerialNumber || '',
        powerState: sys.PowerState || '',
        nicMac, disks,
      }
    } catch (e: any) { return { ok: false, error: String(e.message || e) } }
  }

  // ---------- @Remote: 任务管理 ----------
  @Remote('createTask')
  async createTask(req: CreateTaskRequest): Promise<CreateTaskResult> {
    this.ensureState()
    try {
      if (!this.serverRunning) return { ok: false, error: '部署服务未启动，请先在面板点击「启动」' }
      const img = this.images.find(i => i.id === req.imageId)
      if (!img) return { ok: false, error: 'image not found' }
      if (!req.devices || req.devices.length === 0) return { ok: false, error: 'no devices' }
      const taskIds: string[] = []
      for (const device of req.devices) {
        const id = 'task_' + crypto.randomBytes(6).toString('hex')
        const task: DeployTask = {
          id, imageId: req.imageId, device, components: req.components || ['core'],
          status: 'queued', createdAt: Date.now(),
          startedAt: null, finishedAt: null, progress: 0,
          stage: 'queued', logs: [], error: null,
          queueKey: device.bmcHost,
        }
        this.tasks.set(id, task)
        taskIds.push(id)
      }
      this.save()
      this.processQueue()
      return { ok: true, taskIds }
    } catch (e: any) { return { ok: false, error: String(e.message || e) } }
  }

  @Remote('listTasks')
  async listTasks(): Promise<ListTasksResult> {
    this.ensureState()
    return { tasks: Array.from(this.tasks.values()) }
  }

  @Remote('getTaskDetail')
  async getTaskDetail(req: GetTaskDetailRequest): Promise<GetTaskDetailResult> {
    this.ensureState()
    const task = this.tasks.get(req.taskId)
    if (!task) return { task: null, error: 'task not found' }
    return { task }
  }

  @Remote('cancelTask')
  async cancelTask(req: CancelTaskRequest): Promise<CancelTaskResult> {
    this.ensureState()
    const task = this.tasks.get(req.taskId)
    if (!task) return { ok: false, error: 'task not found' }
    if (task.status === 'running') {
      const runner = this.runners.get(req.taskId)
      if (runner) runner.cancel()
      task.status = 'cancelled'
      task.finishedAt = Date.now()
    } else if (task.status === 'queued') {
      task.status = 'cancelled'
      task.finishedAt = Date.now()
    }
    this.save()
    return { ok: true }
  }

  @Remote('deleteTask')
  async deleteTask(req: DeleteTaskRequest): Promise<DeleteTaskResult> {
    this.ensureState()
    const task = this.tasks.get(req.taskId)
    if (!task) return { ok: false, error: 'task not found' }
    if (task.status === 'running') return { ok: false, error: 'cannot delete running task (cancel first)' }
    this.tasks.delete(req.taskId)
    // 同步删除任务目录（详细安装日志）与迷你 ISO 残留
    this.removeTaskDir(req.taskId)
    this.save()
    return { ok: true }
  }

  // ---------- 任务队列（同一 BMC 串行执行）----------
  private processQueue() {
    if (this.queueRunning) return
    this.queueRunning = true
    this.runNextFromQueue()
  }

  private runNextFromQueue() {
    // Find next queued task whose queueKey isn't currently running
    const runningKeys = new Set(
      Array.from(this.tasks.values())
        .filter(t => t.status === 'running')
        .map(t => t.queueKey)
    )
    const next = Array.from(this.tasks.values())
      .filter(t => t.status === 'queued' && !runningKeys.has(t.queueKey))
      .sort((a, b) => a.createdAt - b.createdAt)[0]

    if (!next) {
      this.queueRunning = false
      return
    }

    // Run this task
    this.runTask(next).then(() => {
      // Check for more queued tasks
      this.runNextFromQueue()
    }).catch(e => {
      console.error('[osdeploy] task error:', e)
      this.runNextFromQueue()
    })
  }

  private async runTask(task: DeployTask) {
    const img = this.images.find(i => i.id === task.imageId)
    if (!img) { task.status = 'failed'; task.error = 'image not found'; this.save(); return }
    // 任务专属目录：详细安装日志（install.log + anaconda.log）落这里
    try { fs.mkdirSync(this.taskDirOf(task.id), { recursive: true }) } catch { /* ignore */ }

    // Auto-extract if needed
    if (!img.extracted) {
      task.status = 'running'
      task.startedAt = Date.now()
      this.addLog(task, 'info', `Extracting ISO: ${img.name}...`)
      const outDir = this.repoDirOf(img.distroId)
      const result = extractIso(img.isoPath, outDir)
      if (result.ok) {
        img.extracted = true
        img.extractedDir = outDir
        if (this.httpServer) this.httpServer.setRoot(`/repo/${img.distroId}`, outDir)
        this.save()
        this.addLog(task, 'info', 'ISO extracted successfully')
      } else {
        task.status = 'failed'
        task.error = `ISO extraction failed: ${result.error}`
        task.finishedAt = Date.now()
        this.addLog(task, 'error', task.error!)
        this.save()
        return
      }
    }

    // Start deployment
    task.status = 'running'
    task.startedAt = Date.now()
    this.addLog(task, 'info', `Starting deployment to ${task.device.bmcHost}...`)
    // 重置本任务的观测计数
    this.rpmCounts.delete(task.id)
    for (const k of Array.from(this.repoSeen.keys())) {
      if (k.startsWith(task.id + ':')) this.repoSeen.delete(k)
    }

    const serverIp = await getRouteIp(task.device.bmcHost)
    this.addLog(task, 'info', `Server IP (routed to ${task.device.bmcHost}): ${serverIp}`)
    const spec: DeploySpec = {
      bmc: { host: task.device.bmcHost, user: task.device.bmcUser, pass: task.device.bmcPassword },
      nicMac: task.device.nicMac,
      hostname: task.device.hostname,
      osIp: task.device.osIp,
      osGateway: task.device.osGateway,
      osPrefixLen: task.device.osPrefixLen,
      osDns: task.device.osDns,
      rootPassword: task.device.rootPassword,
      diskSn: task.device.diskSn || '', // 空则安装期 %pre 自动选第一块盘
      distroId: img.distroId,
      vendor: img.vendor,
      repoDir: img.extractedDir || '',
      components: task.components,
      taskId: task.id,
      isoOutDir: this.isoDirPath(),
    }

    const runner = new DeployRunner(spec, serverIp, HTTP_PORT, (stage, progress, log) => {
      task.stage = stage
      // 进度单调递增（逐包进度与等待循环的进度不再互相回退）
      if (progress >= 0) task.progress = Math.max(task.progress, progress)
      if (log) this.addLog(task, 'info', log)
    })
    this.runners.set(task.id, runner)

    const result = await runner.run()
    this.runners.delete(task.id)

    if (result.ok) {
      task.status = 'success'
      task.progress = 100
      this.addLog(task, 'success', 'OS installation completed successfully!')
    } else {
      task.status = 'failed'
      task.error = result.error || 'unknown error'
      this.addLog(task, 'error', `Deployment failed: ${task.error}`)
    }
    task.finishedAt = Date.now()
    // 任务结束即清理本任务的迷你启动 ISO（可随时按 taskId 确定性重建，
    // 留存只会积累 GB 级垃圾）
    const taskIso = path.join(spec.isoOutDir, `${task.id}.iso`)
    try {
      if (fs.existsSync(taskIso)) {
        fs.rmSync(taskIso, { force: true })
        console.log(`[osdeploy] cleaned mini-ISO: ${taskIso}`)
      }
    } catch { /* 清理失败不影响任务结果 */ }
    this.save()
  }

  // ---------- Report handler (called by target during install) ----------
  private handleReport(query: URLSearchParams, ip: string) {
    const stage = query.get('stage') || ''
    const data = query.get('d') || ''
    const taskTag = query.get('task') || ''
    console.log(`[osdeploy] report from ${ip}: stage=${stage} task=${taskTag} d=${data.slice(0, 100)}`)

    // 匹配任务：优先按 task 标识（安装器回报 URL 带 task=<id>，旧系统开机
    // 自报携带的是上一个任务的 id，不会误匹配），回退到 IP 匹配
    for (const [, task] of this.tasks) {
      if (task.status !== 'running') continue
      const byTag = taskTag && taskTag === task.id
      const byIp = !taskTag && task.device.osIp === ip
      if (!byTag && !byIp) continue
      // 带 task 标识的回报 = 本次安装的实锤证据（供 runner 成功判定）
      if (byTag) this.runners.get(task.id)?.markReport(stage)
      this.addLog(task, 'info', `[installer] ${stage}: ${data}${byTag ? '' : '（未带任务标识）'}`)
      // Update progress based on stage
      const stageProgress: Record<string, number> = {
        'pre-start': 30, 'cmdline': 32, 'disks': 34, 'disk-resolved': 36,
        'pre-done': 38, 'include-uploaded': 40, 'post-install': 85, 'firstboot': 95,
      }
      if (stage in stageProgress) {
        task.progress = stageProgress[stage]
        task.stage = stage
      }
      this.save()
      break
    }
  }

  // ---------- 工具方法 ----------
  private addLog(task: DeployTask, level: string, msg: string) {
    const ts = Date.now()
    task.logs.push({ ts, level: level as any, msg })
    // 逐包安装日志等详细观测需要更大容量（约 300-500 包 + syslog 事件）
    if (task.logs.length > 2000) task.logs.splice(0, task.logs.length - 2000)
    // 同步落盘任务目录（install.log）——界面删除任务/到期自动清理时随目录删除
    try {
      const dir = this.taskDirOf(task.id)
      const line = `${new Date(ts).toISOString()} [${level}] ${msg}\n`
      fs.appendFileSync(path.join(dir, 'install.log'), line, 'utf8')
    } catch { /* 目录未创建（旧任务）等情形忽略 */ }
  }
}

declare const process: { cwd(): string; platform: string }
