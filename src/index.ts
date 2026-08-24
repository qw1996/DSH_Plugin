// dsh-server-manager —— Host 半：服务器纳管后端 Service
// 提供服务 `serverManager`（@Remote 方法供浏览器 UI 调用），并持有库存/巡检/SSH/BMC 逻辑。
import { Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  Server, Check, AddServerRequest, AddServerResult, UpdateServerRequest, UpdateServerResult,
  IdRequest, DeleteServerResult, InspectRequest, InspectResult, ExecRequest, ExecResult,
  BmcPowerRequest, BmcPowerResult, BmcBiosRequest, BmcBiosResult, BmcStatusResult, ListServersResult, UpdateResult,
} from './types'

interface ServerRecord {
  id: string
  name: string
  role: string
  host: string
  sshUser: string
  sshPort: number
  bmcHost: string
  bmcUser: string
  bmcPassword: string
  tags: string[]
  notes: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

interface CheckResult {
  id: string
  name: string
  host: string
  online: boolean
  checkedAt: number
  metrics: Record<string, string>
  error: string | null
}

// 内部辅助方法的宽松返回类型（公开 @Remote 契约用 types.ts 的严格类型，见 src/types.ts）
type Json = any

// 自动更新：留空则禁用；目标机器请改成实际仓库克隆路径（或用环境变量 DSH_SERVER_MANAGER_REPO）。
// DSH host 运行于 Node.js，`process` 在运行时可用；这里做最小声明避免依赖 @types/node。
declare const process: { env: Record<string, string | undefined> }
const REPO_PATH = process.env.DSH_SERVER_MANAGER_REPO || ''
const GIT_PATH = 'git'

export default class ServerManagerService extends TypertRemoteService {
  static inject = ['timer', 'subprocess', 'fs', 'sandboxPolicy']

  servers: ServerRecord[] = []
  checks: Record<string, CheckResult> = {}
  running = false
  lastInspectAt: number | null = null
  inspectIntervalMs = 5 * 60 * 1000
  hasIpmitool = false
  private root: string | null = null
  private policy: unknown = null
  private dataFile: string | null = null

  constructor(ctx: any) {
    super(ctx, 'serverManager')
    const sp = ctx.get('sandboxPolicy')
    if (sp) {
      if (typeof sp.workspaceRoot === 'string' && sp.workspaceRoot) this.root = sp.workspaceRoot.replace(/[\\/]+$/, '')
      if (typeof sp.resolve === 'function') { try { this.policy = sp.resolve() } catch (e) { this.policy = null } }
    }
    this.dataFile = this.root ? this.root + '\\dsh-server-inventory.json' : null
    this.servers = this.seedServers()
  }

  async [Service.init]() {
    await this.load()
    this.hasIpmitool = await this.detectIpmitool().catch(() => false)
    ;(this.ctx as any).setInterval(() => { this.inspectAll([]).catch((e: Error) => console.error('[srvmg] inspect error:', e?.message)) }, this.inspectIntervalMs)
    ;(this.ctx as any).setTimeout(() => { this.inspectAll([]).catch((e: Error) => console.error('[srvmg] initial inspect error:', e?.message)) }, 2500)
  }

  // ---------- 种子 / 规范化 ----------
  private seedServers(): ServerRecord[] {
    // 公开包不内置任何服务器清单/凭据：全部通过浏览器 UI 或持久化库存文件维护。
    return []
  }

  private normalize(s: any): ServerRecord {
    const t = Date.now()
    const tags = Array.isArray(s.tags) ? s.tags.map(String) : (typeof s.tags === 'string' ? s.tags.split(',').map((x: string) => x.trim()).filter(Boolean) : [])
    return {
      id: String(s.id || s.host || ''), name: String(s.name || s.host || ''),
      role: String(s.role || ''), host: String(s.host || ''),
      sshUser: String(s.sshUser || 'root'), sshPort: Number(s.sshPort) || 22,
      bmcHost: String(s.bmcHost || ''), bmcUser: String(s.bmcUser || ''), bmcPassword: String(s.bmcPassword || ''),
      tags, notes: String(s.notes || ''), enabled: s.enabled !== false,
      createdAt: Number(s.createdAt) || t, updatedAt: t,
    }
  }

  private find(id: string) { return this.servers.find((s) => s.id === id) }

  // ---------- 进程 / SSH ----------
  private runArgv(argv: string[], timeoutMs: number): Promise<{ ok: boolean; exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; error?: string }> {
    const subprocess = this.ctx.get('subprocess')
    if (!subprocess) return Promise.resolve({ ok: false, exitCode: null, stdout: '', stderr: '', timedOut: false, error: 'subprocess service unavailable' })
    let handle: any
    try {
      handle = subprocess.spawn({
        argv,
        cwd: this.root || 'C:\\',
        stdio: { stdin: 'ignore', stdout: { maxBytes: 4 * 1024 * 1024 }, stderr: { maxBytes: 4 * 1024 * 1024 } },
        graceMs: 3000,
      })
    } catch (e: any) {
      return Promise.resolve({ ok: false, exitCode: null, stdout: '', stderr: '', timedOut: false, error: String(e?.message || e) })
    }
    return new Promise((resolve) => {
      let settled = false
      let timer: (() => void) | null = null
      let timedOut = false
      const finish = (r: any) => { if (settled) return; settled = true; if (timer) { try { timer() } catch (e) {} } resolve(r) }
      if (timeoutMs > 0) timer = (this.ctx as any).timeout(() => { timedOut = true; try { handle.terminate() } catch (e) {} }, timeoutMs)
      handle.done.then((outcome: any) => {
        let stdout = '', stderr = ''
        try { if (handle.collected?.stdout) stdout = handle.collected.stdout.readFrom(0).text } catch (e) {}
        try { if (handle.collected?.stderr) stderr = handle.collected.stderr.readFrom(0).text } catch (e) {}
        finish({ ok: true, exitCode: outcome.exitCode, stdout, stderr, timedOut })
      }, (err: any) => {
        finish({ ok: false, exitCode: null, stdout: '', stderr: '', timedOut, error: String(err?.message || err) })
      })
    })
  }

  private sshArgs(s: ServerRecord, remote: string, connectSec: number): string[] {
    return ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=' + (connectSec || 10),
      '-o', 'StrictHostKeyChecking=no', '-o', 'LogLevel=ERROR',
      '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
      '-p', String(s.sshPort || 22), (s.sshUser || 'root') + '@' + s.host, remote]
  }

  private async runSsh(s: ServerRecord, remote: string, timeoutMs: number): Promise<Json> {
    const subprocess = this.ctx.get('subprocess')
    if (!subprocess) return { ok: false, error: 'subprocess service unavailable', exitCode: null, stdout: '', stderr: '', timedOut: false }
    const t = timeoutMs || 30000
    const r = await this.runArgv(this.sshArgs(s, remote, Math.min(10, Math.round(t / 1000))), t)
    if (!r.ok) return { ok: false, error: r.error, exitCode: null, stdout: '', stderr: '', timedOut: !!r.timedOut }
    const timedOut = !!r.timedOut
    return { ok: r.exitCode === 0 && !timedOut, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, error: timedOut ? ('command timed out after ' + t + 'ms') : null, timedOut }
  }

  // ---------- 巡检 ----------
  private static readonly PROBE = `echo "HOSTNAME=$(hostname)"; echo "OS=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d= -f2)"; echo "KERNEL=$(uname -r)"; echo "UPTIME=$(uptime -p 2>/dev/null)"; echo "LOAD=$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"; echo "CPUS=$(nproc 2>/dev/null)"; echo "MEM=$(free -m 2>/dev/null | awk '/Mem:/{print $3\"MB_used_of_\"$2\"MB\"}')"; echo "DISK=$(df -h / 2>/dev/null | awk 'NR==2{print $3\"_used_of_\"$2\"_\"$5}')"`

  private parseProbe(stdout: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of String(stdout || '').split(/\r?\n/)) {
      const i = line.indexOf('=')
      if (i <= 0) continue
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      v = v.replace(/^"|"$/g, '')
      out[k] = v
    }
    return out
  }

  private async inspectServer(s: ServerRecord): Promise<CheckResult> {
    const startedAt = Date.now()
    const r = await this.runSsh(s, ServerManagerService.PROBE, 25000)
    const info = this.parseProbe(String(r.stdout || ''))
    const online = !!r.ok && !!info.HOSTNAME
    const result: CheckResult = {
      id: s.id, name: s.name, host: s.host, online,
      checkedAt: startedAt, metrics: info,
      error: online ? null : (String(r.error || r.stderr || ('ssh exit ' + r.exitCode))),
    }
    this.checks[s.id] = result
    return result
  }

  async inspectAll(ids: string[]): Promise<Json> {
    if (this.running) return { ok: false, error: 'inspection already running' }
    this.running = true
    const startedAt = Date.now()
    const results: CheckResult[] = []
    try {
      const idSet = (Array.isArray(ids) ? ids : []).map((x) => String(x).trim()).filter(Boolean)
      const all = idSet.length === 0 || idSet.indexOf('all') >= 0
      const targets = this.servers.filter((s) => s.enabled && (all || idSet.indexOf(s.id) >= 0 || idSet.indexOf(s.name) >= 0 || idSet.indexOf(s.host) >= 0))
      for (const s of targets) results.push(await this.inspectServer(s))
      this.lastInspectAt = startedAt
      return { ok: true, checkedAt: startedAt, results }
    } finally {
      this.running = false
    }
  }

  // ---------- 持久化 ----------
  private async persist(): Promise<boolean> {
    const fs = this.ctx.get('fs')
    if (!fs || !this.dataFile) return false
    try {
      const target = await fs.resolve(this.dataFile)
      await fs.writeText(target, JSON.stringify({ version: 1, servers: this.servers.map((s) => this.normalize(s)) }, null, 2), undefined, undefined, this.policy || undefined)
      return true
    } catch (e: any) { console.error('[srvmg] persist failed:', e?.message); return false }
  }

  private async load(): Promise<void> {
    const fs = this.ctx.get('fs')
    if (!fs || !this.dataFile) return
    try {
      const target = await fs.resolve(this.dataFile)
      const parsed = JSON.parse(await fs.readText(target))
      if (parsed && Array.isArray(parsed.servers) && parsed.servers.length) {
        this.servers = parsed.servers.map((s: any) => this.normalize(s))
      }
    } catch (e) { await this.persist() }
  }

  // ---------- BMC / Redfish ----------
  private async detectIpmitool(): Promise<boolean> {
    if (!this.ctx.get('subprocess')) return false
    const r = await this.runArgv(['ipmitool', '-V'], 5000)
    return !!(r.ok && r.exitCode === 0)
  }

  private async redfishRequest(s: ServerRecord, method: string, path: string, body?: unknown, timeoutMs?: number, etag?: string): Promise<Json> {
    const argv = ['curl', '-s', '-k', '--max-time', String(Math.max(5, Math.round((timeoutMs || 15000) / 1000))),
      '-u', (s.bmcUser || 'Administrator') + ':' + (s.bmcPassword || ''),
      '-H', 'Content-Type: application/json',
      '-w', '__RF_STATUS__%{http_code}']
    if (etag) argv.push('-H', 'If-Match: ' + etag)
    argv.push('-X', method)
    if (body) argv.push('-d', JSON.stringify(body))
    argv.push('https://' + s.bmcHost + path)
    const r = await this.runArgv(argv, timeoutMs || 15000)
    if (!r.ok) return { ok: false, error: r.error }
    if (r.exitCode !== 0) return { ok: false, error: (r.stderr || r.stdout || 'curl exit ' + r.exitCode).trim() }
    const out = String(r.stdout || '')
    const idx = out.lastIndexOf('__RF_STATUS__')
    let status = 0
    let bodyText = out
    if (idx >= 0) { status = parseInt(out.slice(idx + '__RF_STATUS__'.length), 10) || 0; bodyText = out.slice(0, idx) }
    if (status >= 400) {
      let errMsg = 'BMC Redfish HTTP ' + status
      try {
        const d = JSON.parse(bodyText)
        if (d?.error) {
          const ext = d.error['@Message.ExtendedInfo']
          const msg = (Array.isArray(ext) && ext[0]?.Message) || d.error.message || ''
          if (msg) errMsg = msg
        }
      } catch (e) {}
      return { ok: false, error: errMsg, httpStatus: status }
    }
    try { return { ok: true, data: JSON.parse(bodyText) } }
    catch (e) { return { ok: false, error: 'non-JSON Redfish response (HTTP ' + status + '): ' + bodyText.slice(0, 200), httpStatus: status } }
  }

  private async redfishEtag(s: ServerRecord, path: string, timeoutMs?: number): Promise<string | null> {
    const argv = ['curl', '-s', '-k', '--max-time', String(Math.max(5, Math.round((timeoutMs || 15000) / 1000))),
      '-u', (s.bmcUser || 'Administrator') + ':' + (s.bmcPassword || ''), '-D', '-', '-o', 'NUL', 'https://' + s.bmcHost + path]
    const r = await this.runArgv(argv, timeoutMs || 15000)
    if (!r.ok || r.exitCode !== 0) return null
    const m = /ETag:\s*([^\r\n]+)/i.exec(r.stdout || '')
    return m ? m[1].trim() : null
  }

  private async redfishSystemId(s: ServerRecord): Promise<Json> {
    const r = await this.redfishRequest(s, 'GET', '/redfish/v1/Systems')
    if (!r.ok) return r
    const data = (r.data || {}) as any
    if (data.error) {
      const ext = data.error['@Message.ExtendedInfo']
      const msg = (Array.isArray(ext) && ext[0]?.Message) || data.error.message || 'Redfish error'
      return { ok: false, error: 'BMC Redfish: ' + msg }
    }
    const members = data.Members || []
    if (!members.length) return { ok: false, error: 'no Systems members in Redfish response' }
    return { ok: true, id: members[0]['@odata.id'] || members[0].Id || '/redfish/v1/Systems/1' }
  }

  async doUpdate(): Promise<Json> {
    if (!REPO_PATH) return { ok: false, error: '自更新未配置：请设置环境变量 DSH_SERVER_MANAGER_REPO 后重启 DSH。' }
    const git = [GIT_PATH, '-c', 'http.sslBackend=openssl', '-C', REPO_PATH]
    const before = await this.runArgv(git.concat(['rev-parse', 'HEAD']), 15000)
    const beforeHash = (before.ok && before.exitCode === 0) ? before.stdout.trim() : null
    const r = await this.runArgv(git.concat(['pull', '--no-edit']), 120000)
    if (!r.ok) return { ok: false, error: r.error }
    if (r.exitCode !== 0) return { ok: false, error: (r.stderr || r.stdout || 'git pull exit ' + r.exitCode).trim() }
    const after = await this.runArgv(git.concat(['rev-parse', 'HEAD']), 15000)
    const afterHash = (after.ok && after.exitCode === 0) ? after.stdout.trim() : null
    const log = await this.runArgv(git.concat(['log', '--oneline', '-3']), 15000)
    return { ok: true, changed: beforeHash !== afterHash, beforeHash, afterHash, log: (log.ok ? log.stdout : '').trim(), pullOutput: (r.stdout || '').trim(), repoPath: REPO_PATH, note: '若 changed=true，请重新构建并重启 DSH 以生效。' }
  }

  // ---------- @Remote 公开方法（供 UI 与工具包调用） ----------
  @Remote('listServers')
  listServers(): ListServersResult {
    return {
      ok: true, servers: this.servers.map((s) => ({ ...s })), checks: this.checks,
      lastInspectAt: this.lastInspectAt, inspectIntervalMs: this.inspectIntervalMs,
      hasIpmitool: this.hasIpmitool, bmcTransport: this.hasIpmitool ? 'redfish+ipmitool' : 'redfish', running: this.running,
    }
  }

  @Remote('addServer')
  async addServer(request: AddServerRequest): Promise<AddServerResult> {
    if (!request?.host) return { ok: false, error: 'host is required' }
    const host = String(request.host).trim()
    if (this.servers.some((s) => s.host === host)) return { ok: false, error: 'server with host ' + host + ' already exists' }
    const rec = this.normalize({ ...request, id: request.id || host, host })
    this.servers.push(rec)
    await this.persist()
    return { ok: true, server: rec as Server }
  }

  @Remote('updateServer')
  async updateServer(request: UpdateServerRequest): Promise<UpdateServerResult> {
    const { id, patch } = request
    const rec = this.find(id)
    if (!rec) return { ok: false, error: 'server not found: ' + id }
    if (patch?.host && patch.host !== rec.host && this.servers.some((s) => s.id !== id && s.host === patch.host)) return { ok: false, error: 'host already used' }
    Object.assign(rec, this.normalize({ ...rec, ...(patch || {}), id: rec.id }))
    await this.persist()
    return { ok: true, server: rec as Server }
  }

  @Remote('deleteServer')
  async deleteServer(request: IdRequest): Promise<DeleteServerResult> {
    const id = request.id
    const i = this.servers.findIndex((s) => s.id === id)
    if (i < 0) return { ok: false, error: 'server not found: ' + id }
    this.servers.splice(i, 1)
    delete this.checks[id]
    await this.persist()
    return { ok: true }
  }

  @Remote('inspect')
  inspect(request: InspectRequest): Promise<InspectResult> {
    const ids = request?.id ? String(request.id).split(',').map((x) => x.trim()).filter(Boolean) : []
    return this.inspectAll(ids)
  }

  @Remote('exec')
  async exec(request: ExecRequest): Promise<ExecResult> {
    const targets = this.resolveTargets(request.id)
    if (!targets.length) return { ok: false, error: 'no matching servers' }
    const results: Json[] = []
    for (const s of targets) {
      const r = await this.runSsh(s, request.command || '', request.timeoutMs || 30000)
      results.push({ id: s.id, name: s.name, host: s.host, ok: r.ok, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr, error: r.error || null, timedOut: !!r.timedOut })
    }
    return { ok: true, results }
  }

  @Remote('bmcStatus')
  async bmcStatus(request: IdRequest): Promise<BmcStatusResult> {
    const s = this.find(request.id)
    if (!s) return { ok: false, error: 'server not found' }
    if (!s.bmcHost) return { ok: false, error: 'BMC host not configured for ' + s.id }
    const sys = await this.redfishSystemId(s)
    if (sys.ok) {
      const r = await this.redfishRequest(s, 'GET', String(sys.id))
      if (r.ok) {
        const d = (r.data || {}) as any
        return { ok: true, transport: 'redfish', model: d.Model || null, manufacturer: d.Manufacturer || null, serial: d.SerialNumber || null, powerState: d.PowerState || null, health: d.Status?.Health || null, severity: d.Status?.Oem?.Huawei?.Severity || null }
      }
    }
    return { ok: false, transport: 'redfish', error: String(sys.error || 'BMC unreachable') }
  }

  @Remote('bmcPower')
  async bmcPower(request: BmcPowerRequest): Promise<BmcPowerResult> {
    const s = this.find(request.id)
    if (!s) return { ok: false, error: 'server not found' }
    if (!s.bmcHost) return { ok: false, error: 'BMC host not configured for ' + s.id }
    const action = request.action
    const sys = await this.redfishSystemId(s)
    if (!sys.ok) return sys
    if (action === 'status') {
      const r = await this.redfishRequest(s, 'GET', String(sys.id))
      if (!r.ok) return r
      const d = (r.data || {}) as any
      return { ok: true, transport: 'redfish', powerState: d.PowerState || null, health: d.Status?.Health || null }
    }
    const resetMap: Record<string, string> = { on: 'On', off: 'ForceOff', cycle: 'ForceRestart', reset: 'ForceRestart', 'graceful-off': 'GracefulShutdown', 'graceful-restart': 'GracefulRestart' }
    const rt = resetMap[action]
    if (!rt) return { ok: false, error: 'unknown action: ' + action }
    const r = await this.redfishRequest(s, 'POST', String(sys.id) + '/Actions/ComputerSystem.Reset', { ResetType: rt }, 40000)
    return r.ok ? { ok: true, transport: 'redfish', requested: rt, note: 'Reset action submitted via Redfish.' } : r
  }

  @Remote('bmcBios')
  async bmcBios(request: BmcBiosRequest): Promise<BmcBiosResult> {
    const s = this.find(request.id)
    if (!s) return { ok: false, error: 'server not found' }
    if (!s.bmcHost) return { ok: false, error: 'BMC host not configured for ' + s.id }
    const attribute = request.attribute
    const value = request.value
    const sys = await this.redfishSystemId(s)
    if (!sys.ok) return { ...sys, transport: 'redfish', hint: 'BIOS read/write is Redfish-only.' }
    const biosPath = String(sys.id) + '/Bios'
    const wantWrite = value !== undefined && value !== null
    if (!attribute) {
      const r = await this.redfishRequest(s, 'GET', biosPath)
      if (!r.ok) return r
      const d = (r.data || {}) as any
      const attrs = d.Attributes || {}
      return { ok: true, transport: 'redfish', attributeRegistry: d.AttributeRegistry || null, attributeCount: Object.keys(attrs).length, attributes: attrs }
    }
    if (!wantWrite) {
      const r = await this.redfishRequest(s, 'GET', biosPath)
      if (!r.ok) return r
      const d = (r.data || {}) as any
      const attrs = d.Attributes || {}
      return { ok: true, transport: 'redfish', attribute, value: Object.prototype.hasOwnProperty.call(attrs, attribute) ? attrs[attribute] : null }
    }
    const etag = await this.redfishEtag(s, biosPath + '/Settings')
    if (!etag) return { ok: false, transport: 'redfish', error: 'could not obtain BIOS Settings ETag for write' }
    const attrs: Record<string, string> = {}; attrs[attribute] = value!
    const r = await this.redfishRequest(s, 'PATCH', biosPath + '/Settings', { Attributes: attrs }, 40000, etag)
    if (!r.ok) return { ...r, transport: 'redfish' }
    return { ok: true, transport: 'redfish', set: attrs, note: 'Pending BIOS change staged via Redfish; reboot the server for it to take effect.' }
  }

  @Remote('update')
  update(): Promise<UpdateResult> {
    return this.doUpdate() as Promise<UpdateResult>
  }

  private resolveTargets(expr: string): ServerRecord[] {
    const parts = String(expr || '').split(',').map((x) => x.trim()).filter(Boolean)
    if (parts.length === 0 || parts.indexOf('all') >= 0) return this.servers.slice()
    return this.servers.filter((s) => parts.indexOf(s.id) >= 0 || parts.indexOf(s.name) >= 0 || parts.indexOf(s.host) >= 0)
  }
}
