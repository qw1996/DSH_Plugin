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
} from './types'
import {
  RedfishClient, DeployHttpServer, DeployRunner, DeploySpec,
  extractIso, genKickstart, genPreseed, getRouteIp,
} from './engine'
import { DEFAULT_TLS_CERT, DEFAULT_TLS_KEY } from './certs'

type Json = any

const HTTP_PORT = 8080
/** 虚拟光驱 HTTPS 端口（iBMC 要求 https:// 镜像 URL；443 免端口后缀） */
const HTTPS_PORT = 443

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
  private root: string | null = null
  private dataFile: string | null = null
  private queueRunning = false

  constructor(ctx: any) {
    super(ctx, 'osDeploy')
    const sp = ctx.get('sandboxPolicy')
    if (sp && typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) {
      this.root = sp.workspaceRoot.replace(/[\\/]+$/, '')
    }
    this.dataFile = this.root ? path.join(this.root, 'dsh-os-deploy-state.json') : null
    this.load()
    // cordis Service 没有 [Service.dispose] 符号（服务随 fiber 自动注销），
    // 清理逻辑挂在 Context 的 dispose 事件上。
    ctx.on('dispose', () => {
      if (this.httpServer) this.httpServer.stop()
      for (const [, r] of this.runners) r.cancel()
    })
  }

  async [Service.init]() {
    // 轻量启动：只加载持久化状态。HTTP 仓库与任务队列由 serviceStart() 按需拉起，
    // 保证 DSH 启动速度不受部署服务影响（默认不启动）。
    console.log('[osdeploy] service loaded (idle) — 在面板点击「启动」后才会开启部署服务')
  }

  // ---------- @Remote: 服务控制 ----------
  @Remote('serviceStatus')
  async serviceStatus(): Promise<ServiceStatusResult> {
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
      this.httpServer = new DeployHttpServer(HTTP_PORT, HTTPS_PORT)
      this.httpServer.onReport((query, ip) => this.handleReport(query, ip))
      // BMC 拉取虚拟光驱镜像的节流日志（引导是否真的发生的关键观测）
      this.httpServer.onIsoAccess(({ count, method, status, ip }) => {
        console.log(`[osdeploy] virtual CD fetch #${count}: ${method} ${status} from ${ip}`)
        for (const [, task] of this.tasks) {
          if (task.status === 'running' && ip === task.device.bmcHost) {
            this.addLog(task, 'info', `虚拟光驱被 BMC 拉取 (req #${count}: ${method} ${status})`)
            break
          }
        }
      })
      // 虚拟光驱镜像目录（HTTPS /iso 根）与 TLS 证书
      const isoDir = path.join(this.root || os.tmpdir(), 'os-deploy-iso')
      fs.mkdirSync(isoDir, { recursive: true })
      this.httpServer.setRoot('/iso', isoDir)
      const tls = this.ensureTls()
      await this.httpServer.start(tls)
      // 为已解包的镜像重新注册 HTTP 根
      for (const img of this.images) {
        if (img.extracted && img.extractedDir) this.httpServer.setRoot(`/repo/${img.distroId}`, img.extractedDir)
      }
      if (!this.httpServer.httpsUp) {
        this.addSvcNote(`HTTPS :${HTTPS_PORT} 未就绪（${this.httpServer.httpsError}）——虚拟光驱挂载将失败`)
      }
      this.serverRunning = true
      this.serverStartedAt = Date.now()
      console.log(`[osdeploy] HTTP server listening on 0.0.0.0:${HTTP_PORT}, HTTPS on :${HTTPS_PORT}`)
      // 恢复队列中排队的任务
      this.processQueue()
      return { ok: true, status: await this.serviceStatus() }
    } catch (e: any) {
      this.httpServer = null
      return { ok: false, error: String(e?.message || e) }
    }
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
      this.serverRunning = false
      this.serverStartedAt = null
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
  private load() {
    if (!this.dataFile || !fs.existsSync(this.dataFile)) return
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'))
      this.images = data.images || []
      for (const t of (data.tasks || [])) this.tasks.set(t.id, t)
    } catch (e) { console.error('[osdeploy] load state error:', e) }
  }

  private save() {
    if (!this.dataFile) return
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify({
        images: this.images,
        tasks: Array.from(this.tasks.values()),
      }, null, 2))
    } catch (e) { console.error('[osdeploy] save state error:', e) }
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
    const img = this.images.find(i => i.id === req.imageId)
    if (!img) return { ok: false, error: 'image not found' }
    if (img.extracted && img.extractedDir) return { ok: true }
    const outDir = path.join(this.root || os.tmpdir(), 'os-deploy-repo', img.distroId)
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
    const idx = this.images.findIndex(i => i.id === req.imageId)
    if (idx < 0) return { ok: false, error: 'image not found' }
    const img = this.images[idx]
    if (this.httpServer) this.httpServer.removeRoot(`/repo/${img.distroId}`)
    this.images.splice(idx, 1)
    this.save()
    return { ok: true }
  }

  @Remote('listImages')
  async listImages(): Promise<ListImagesResult> {
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
    return { tasks: Array.from(this.tasks.values()) }
  }

  @Remote('getTaskDetail')
  async getTaskDetail(req: GetTaskDetailRequest): Promise<GetTaskDetailResult> {
    const task = this.tasks.get(req.taskId)
    if (!task) return { task: null, error: 'task not found' }
    return { task }
  }

  @Remote('cancelTask')
  async cancelTask(req: CancelTaskRequest): Promise<CancelTaskResult> {
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
    const task = this.tasks.get(req.taskId)
    if (!task) return { ok: false, error: 'task not found' }
    if (task.status === 'running') return { ok: false, error: 'cannot delete running task (cancel first)' }
    this.tasks.delete(req.taskId)
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

    // Auto-extract if needed
    if (!img.extracted) {
      task.status = 'running'
      task.startedAt = Date.now()
      this.addLog(task, 'info', `Extracting ISO: ${img.name}...`)
      const outDir = path.join(this.root || process.cwd(), 'os-deploy-repo', img.distroId)
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
      isoOutDir: path.join(this.root || process.cwd(), 'os-deploy-iso'),
    }

    const runner = new DeployRunner(spec, serverIp, HTTP_PORT, (stage, progress, log) => {
      task.stage = stage
      if (progress >= 0) task.progress = progress
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
    task.logs.push({ ts: Date.now(), level: level as any, msg })
    if (task.logs.length > 200) task.logs.splice(0, task.logs.length - 200)
  }
}

declare const process: { cwd(): string; platform: string }
