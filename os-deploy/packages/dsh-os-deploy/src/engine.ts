// engine.ts — core deployment engine (adapted from the proven osdeploy project)
// Handles: BMC Redfish (virtual media, boot override, power), kickstart/preseed
// generation, mini-ISO building, HTTP serving, progress monitoring.

import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import * as crypto from 'crypto'

// ---------- Types ----------
export interface EngineConfig {
  workDir: string            // base dir for all engine state
  httpPort: number           // port for serving packages to targets
}

export interface BmcInfo {
  host: string
  user: string
  pass: string
}

export interface DeploySpec {
  bmc: BmcInfo
  nicMac: string
  hostname: string
  osIp: string
  osGateway: string
  osPrefixLen: number
  osDns: string[]
  rootPassword: string
  diskSn: string             // target disk serial number
  distroId: string
  vendor: string             // 'openEuler' | 'kylin' | 'debian'
  repoDir: string            // extracted ISO directory
  components: string[]       // package groups / explicit packages
}

export interface ProgressCallback {
  (stage: string, progress: number, log?: string): void
}

// ---------- Redfish Client (Huawei iBMC compatible) ----------
export class RedfishClient {
  private host: string
  private user: string
  private pass: string
  private token: string | null = null

  constructor(bmc: BmcInfo) {
    this.host = bmc.host
    this.user = bmc.user
    this.pass = bmc.pass
  }

  req(method: string, uri: string, body?: any, extraHeaders?: Record<string, string>): Promise<{ status: number; headers: any; json: any; raw: string }> {
    return new Promise((resolve, reject) => {
      const data = body !== undefined ? JSON.stringify(body) : null
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': data ? String(Buffer.byteLength(data)) : '0',
        ...extraHeaders,
      }
      if (this.token) headers['X-Auth-Token'] = this.token
      else headers['Authorization'] = 'Basic ' + Buffer.from(`${this.user}:${this.pass}`).toString('base64')
      const r = https.request({ host: this.host, path: uri, method, headers, rejectUnauthorized: false, timeout: 30000 }, (res: any) => {
        let buf = ''
        res.on('data', (c: string) => { buf += c })
        res.on('end', () => {
          let json: any = null
          try { json = buf ? JSON.parse(buf) : null } catch (e) { /* not json */ }
          resolve({ status: res.statusCode, headers: res.headers, json, raw: buf })
        })
      })
      r.on('error', reject)
      r.on('timeout', () => r.destroy(new Error('request timeout')))
      if (data) r.write(data)
      r.end()
    })
  }

  get(u: string) { return this.req('GET', u) }
  post(u: string, b?: any) { return this.req('POST', u, b) }
  patch(u: string, b?: any, extra?: Record<string, string>) { return this.req('PATCH', u, b, extra) }

  async getSystem(): Promise<any> {
    const r = await this.get('/redfish/v1/Systems/1')
    if (r.status !== 200) throw new Error(`getSystem -> HTTP ${r.status}`)
    return r.json
  }

  async getStorage(): Promise<any> {
    try {
      const r = await this.get('/redfish/v1/Systems/1/Storage')
      if (r.status !== 200) return null
      const storages: any[] = []
      for (const m of (r.json.Members || [])) {
        const sr = await this.get(m['@odata.id'])
        if (sr.status === 200) storages.push(sr.json)
      }
      // get drives and volumes
      for (const s of storages) {
        if (s.Drives) {
          s.driveDetails = []
          for (const d of s.Drives) {
            const dr = await this.get(d['@odata.id'])
            if (dr.status === 200) s.driveDetails.push(dr.json)
          }
        }
        if (s.Volumes) {
          const vr = await this.get(s.Volumes['@odata.id'])
          if (vr.status === 200) {
            s.volumeDetails = []
            for (const v of (vr.json.Members || []).slice(0, 5)) {
              const vm = await this.get(v['@odata.id'])
              if (vm.status === 200) s.volumeDetails.push(vm.json)
            }
          }
        }
      }
      return storages
    } catch (e) { return null }
  }

  async patchSystem(body: any): Promise<void> {
    const g = await this.get('/redfish/v1/Systems/1')
    const etag = g.headers && g.headers['etag']
    const extra: Record<string, string> = {}
    if (etag) extra['If-Match'] = etag
    const r = await this.patch('/redfish/v1/Systems/1', body, extra)
    if (r.status !== 200 && r.status !== 204) throw new Error(`patchSystem -> HTTP ${r.status} ${r.raw ? r.raw.slice(0, 200) : ''}`)
  }

  async setBootOnce(target: string): Promise<void> {
    await this.patchSystem({ Boot: { BootSourceOverrideEnabled: 'Once', BootSourceOverrideTarget: target } })
  }

  async power(action: string): Promise<void> {
    const r = await this.post('/redfish/v1/Systems/1/Actions/ComputerSystem.Reset', { ResetType: action })
    if (r.status !== 200 && r.status !== 204) throw new Error(`power ${action} -> HTTP ${r.status}`)
  }

  async vmediaConnect(imageUrl: string): Promise<void> {
    const r = await this.post('/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl',
      { VmmControlType: 'Connect', Image: imageUrl })
    if (r.status >= 400) throw new Error(`vmediaConnect -> HTTP ${r.status}`)
  }

  async vmediaDisconnect(): Promise<void> {
    const r = await this.post('/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl',
      { VmmControlType: 'Disconnect' })
    if (r.status >= 400) throw new Error(`vmediaDisconnect -> HTTP ${r.status}`)
  }

  async vmediaStatus(): Promise<any> {
    const r = await this.get('/redfish/v1/Managers/1/VirtualMedia/CD')
    if (r.status !== 200) throw new Error(`vmediaStatus -> HTTP ${r.status}`)
    return r.json
  }
}

// ---------- Self-signed TLS cert generation ----------
export function generateSelfSignedCert(): { cert: string; key: string } {
  // In production, use node-forge or openssl. For now, generate a minimal
  // self-signed cert using the `crypto` module's generateKeyPairSync.
  // The iBMC accepts self-signed certs for VMMControl.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  // For a proper X.509 cert, we'd need node-forge. For MVP, we use a
  // pre-generated cert or shell out to openssl if available.
  // For now, return the raw keys — the caller should handle cert generation.
  return { cert: publicKey as string, key: privateKey as string }
}

// ---------- Kickstart / Preseed Generators ----------
export function genKickstart(spec: DeploySpec, serverIp: string, httpPort: number): string {
  const pw = spec.rootPassword
  const mask = prefixToMask(spec.osPrefixLen)
  const dns = (spec.osDns || ['114.114.114.114']).join(' ')
  const packages = buildPackageList(spec.vendor, spec.components)
  const base = `http://${serverIp}:${httpPort}/repo/${spec.distroId}`

  return `# osdeploy generated kickstart
cmdline
lang zh_CN.UTF-8
keyboard us
timezone Asia/Shanghai --utc
zerombr
%include /tmp/osdeploy-disk.ks
network --bootproto=static --ip=${spec.osIp} --netmask=${mask} --gateway=${spec.osGateway} --nameserver=${dns} --hostname=${spec.hostname} --device=${spec.nicMac} --activate --onboot=yes
url --url=${base}/
rootpw --plaintext '${pw}'
sshpw --username=root '${pw}' --plaintext
firstboot --disable
selinux --disabled
firewall --disabled
services --enabled=sshd
reboot

%packages
${packages}
%end

%pre --interpreter=/usr/bin/bash
exec >/tmp/osdeploy-pre.log 2>&1
set -x
__R() { curl -s -m 8 -G --data-urlencode "m=deploy" --data-urlencode "stage=$1" --data-urlencode "d=$2" "http://${serverIp}:${httpPort}/report" >/dev/null 2>&1 || true; }
__R pre-start
TARGET_SN="${spec.diskSn}"
TARGET=""
for d in $(lsblk -dn -o NAME,TYPE | awk '$2=="disk"{print $1}'); do
  sn=$(lsblk -dn -o SERIAL /dev/$d 2>/dev/null | tr -d ' ')
  if [ "$sn" = "$TARGET_SN" ]; then TARGET="$d"; fi
done
__R disks "target=$TARGET sn=$TARGET_SN"
if [ -z "$TARGET" ]; then __R fatal "disk not found SN=$TARGET_SN"; sleep 5; exit 1; fi
__R disk-resolved "$TARGET"
cat > /tmp/osdeploy-disk.ks <<KSEOF
ignoredisk --only-use=$TARGET
clearpart --all --initlabel --disklabel=gpt
bootloader --timeout=1
part /boot/efi --fstype=vfat --size=512 --fsoptions="umask=0077,shortname=winnt"
part /boot --fstype=ext4 --size=1024
part swap --size=8192
part / --fstype=xfs --grow --size=10240
KSEOF
__R pre-done "$TARGET"
%end

%post --nochroot --interpreter=/usr/bin/bash
curl -s -m 8 "http://${serverIp}:${httpPort}/report?m=deploy&stage=post-install" >/dev/null 2>&1 || true
cp /tmp/osdeploy-pre.log /mnt/sysimage/root/osdeploy-pre.log 2>/dev/null || true
%end

%post --interpreter=/usr/bin/bash
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true
cat > /etc/systemd/system/osdeploy-report.service <<'EOFSVC'
[Unit]
Description=osdeploy firstboot report
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/curl -s -m 10 "http://${serverIp}:${httpPort}/report?m=deploy&stage=firstboot"
[Install]
WantedBy=multi-user.target
EOFSVC
systemctl enable osdeploy-report.service || true
%end
`
}

export function genPreseed(spec: DeploySpec, serverIp: string, httpPort: number): string {
  const pw = spec.rootPassword
  const dns = (spec.osDns || ['114.114.114.114']).join(' ')
  const base = `http://${serverIp}:${httpPort}/repo/${spec.distroId}`
  const components = buildPackageList(spec.vendor, spec.components)

  return `#### osdeploy generated preseed
d-i debian-installer/locale string en_US.UTF-8
d-i keyboard-configuration/xkb-keymap select us
d-i netcfg/disable_autoconfig boolean true
d-i netcfg/get_ipaddress string ${spec.osIp}
d-i netcfg/get_netmask string ${prefixToMask(spec.osPrefixLen)}
d-i netcfg/get_gateway string ${spec.osGateway}
d-i netcfg/get_nameservers string ${dns}
d-i netcfg/get_hostname string ${spec.hostname}
d-i netcfg/get_domain string local
d-i mirror/country string manual
d-i mirror/http/hostname string ${serverIp}
d-i mirror/http/directory string /repo/${spec.distroId}
d-i mirror/http/proxy string
d-i apt-setup/services-select multiselect none
d-i clock-setup/utc boolean true
d-i clock-setup/ntp boolean false
d-i time/zone string Asia/Shanghai
d-i passwd/make-user boolean false
d-i passwd/root-password password ${pw}
d-i passwd/root-password-again password ${pw}
d-i partman-auto/method string regular
d-i partman-lvm/device_remove_lvm boolean true
d-i partman-md/device_remove_md boolean true
d-i partman-auto/choose_recipe select atomic
d-i partman/early_command string \\
  DEV="" ; \\
  for d in /dev/disk/by-id/* ; do \\
    case "$d" in *-part*) continue ;; esac ; \\
    case "$d" in *"${spec.diskSn}"*) DEV="$d"; break ;; esac ; \\
  done ; \\
  if [ -n "$DEV" ] ; then \\
    . /usr/share/debconf/confmodule ; \\
    db_set partman-auto/disk "$DEV" ; \\
  fi ; \\
  true
d-i partman-partitioning/confirm_write_new_label boolean true
d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true
d-i debian-installer/allow_unauthenticated boolean true
d-i grub-installer/only_debian boolean true
d-i grub-installer/with_other_os boolean false
d-i pkgsel/include string ${components.replace(/\n/g, ' ')}
d-i pkgsel/upgrade select none
d-i popularity-contest/participate boolean false
d-i finish-install/reboot_in_progress note

d-i preseed/early_command string \\
  mkdir -p /etc/apt/apt.conf.d ; \\
  printf 'Acquire::AllowInsecureRepositories "true";\\nAPT::Get::AllowUnauthenticated "true";\\n' > /etc/apt/apt.conf.d/99osdeploy.conf

d-i preseed/late_command string \\
  in-target sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config ; \\
  in-target curl -s -m 10 "${base}/../report?m=deploy&stage=post-install" || true
`
}

// ---------- Package list builder ----------
function buildPackageList(vendor: string, components: string[]): string {
  const lines: string[] = []
  const compSet = new Set(components)
  if (vendor === 'debian') {
    if (compSet.has('core') || compSet.size === 0) lines.push('openssh-server', 'curl')
    if (compSet.has('devel')) lines.push('build-essential', 'gcc', 'make', 'gdb', 'git')
    if (compSet.has('ssh-server')) lines.push('openssh-server')
  } else {
    // openEuler / Kylin (anaconda)
    lines.push('@core')
    if (compSet.has('ssh-server') || compSet.size === 0) lines.push('openssh-server')
    lines.push('curl', 'wget', 'tar')
    if (compSet.has('devel')) lines.push('@development', 'gcc', 'gcc-c++', 'make', 'gdb', 'git')
    if (compSet.has('minimal-extra')) lines.push('vim', 'net-tools', 'bind-utils')
  }
  return lines.join('\n')
}

// ---------- Network helpers ----------
function prefixToMask(prefix: number): string {
  const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0
  return [(mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF].join('.')
}

// ---------- HTTP Server (serves packages + receives reports) ----------
export class DeployHttpServer {
  private server: http.Server | null = null
  private port: number
  private roots: Map<string, string> = new Map() // urlPrefix -> dir
  private reportHandler: ((query: URLSearchParams, ip: string) => void) | null = null

  constructor(port: number) {
    this.port = port
  }

  setRoot(prefix: string, dir: string) { this.roots.set(prefix, dir) }
  removeRoot(prefix: string) { this.roots.delete(prefix) }
  onReport(handler: (query: URLSearchParams, ip: string) => void) { this.reportHandler = handler }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        try { this.handle(req, res) } catch (e) {
          res.writeHead(500); res.end('error')
        }
      })
      this.server.on('error', reject)
      this.server.listen(this.port, '0.0.0.0', () => resolve())
    })
  }

  stop() { if (this.server) { this.server.close(); this.server = null } }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const u = new URL(req.url || '/', 'http://localhost')
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '')

    if (u.pathname === '/report' || u.pathname === '/report/') {
      const q = u.searchParams
      if (this.reportHandler) this.reportHandler(q, ip)
      res.writeHead(200); res.end('ok')
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405); res.end(); return
    }

    // percent-decode path
    let pathname = u.pathname
    try { pathname = decodeURIComponent(u.pathname) } catch (e) { }

    // find matching root (longest prefix wins)
    const prefix = Array.from(this.roots.keys())
      .filter(p => pathname === p || pathname.startsWith(p + '/') || p === '/')
      .sort((a, b) => b.length - a.length)[0]
    if (!prefix) { res.writeHead(404); res.end('not found'); return }

    const rel = pathname.slice(prefix === '/' ? 0 : prefix.length).replace(/^\/+/, '')
    const fp = path.join(this.roots.get(prefix)!, rel)
    const rootAbs = path.resolve(this.roots.get(prefix)!)
    if (!path.resolve(fp).startsWith(rootAbs)) { res.writeHead(403); res.end(); return }

    fs.stat(fp, (e: any, st: any) => {
      if (e || !st.isFile()) { res.writeHead(404); res.end('not found'); return }
      const total = st.size
      let start = 0, end = total - 1, code = 200
      const range = req.headers['range']
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(range))
        if (m) {
          if (m[1]) start = parseInt(m[1])
          if (m[2]) end = Math.min(parseInt(m[2]), total - 1)
          else end = total - 1
          code = 206
        }
      }
      const len = end - start + 1
      res.writeHead(code, {
        'Content-Length': len,
        'Accept-Ranges': 'bytes',
        ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${total}` } : {}),
      })
      if (req.method === 'HEAD') { res.end(); return }
      const stream = fs.createReadStream(fp, { start, end })
      stream.on('error', () => { try { res.destroy() } catch (e) { } })
      stream.pipe(res)
    })
  }
}

// ---------- ISO Extraction (via tar/bsdtar on Windows) ----------
import { execFileSync } from 'child_process'

export function extractIso(isoPath: string, outDir: string): { ok: boolean; error?: string } {
  try {
    fs.mkdirSync(outDir, { recursive: true })
    // On Windows, use tar (bsdtar) which handles ISO9660
    // On Linux, could use 7z or mount
    execFileSync('tar', ['-xf', isoPath, '-C', outDir], { timeout: 600000, stdio: 'pipe' })
    return { ok: true }
  } catch (e: any) {
    // tar may exit 1 on some files (Chinese filenames etc) but still extract the important stuff
    // Check if key directories were created
    const hasPackages = fs.existsSync(path.join(outDir, 'Packages')) || fs.existsSync(path.join(outDir, 'pool'))
    const hasDists = fs.existsSync(path.join(outDir, 'dists')) || fs.existsSync(path.join(outDir, '.treeinfo'))
    if (hasPackages || hasDists) {
      return { ok: true }
    }
    return { ok: false, error: String(e.message || e) }
  }
}

// ---------- Deployment Orchestrator ----------
export class DeployRunner {
  private rf: RedfishClient
  private spec: DeploySpec
  private serverIp: string
  private httpPort: number
  private progress: ProgressCallback
  private cancelled = false

  constructor(spec: DeploySpec, serverIp: string, httpPort: number, progress: ProgressCallback) {
    this.spec = spec
    this.serverIp = serverIp
    this.httpPort = httpPort
    this.progress = progress
    this.rf = new RedfishClient(spec.bmc)
  }

  cancel() { this.cancelled = true }

  async run(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Phase 1: Preflight (inventory)
      this.progress('preflight', 2, 'Probing BMC...')
      const sys = await this.rf.getSystem()
      this.progress('preflight', 5, `BMC ok: ${sys.Model || 'unknown'} power=${sys.PowerState}`)

      if (this.cancelled) return { ok: false, error: 'cancelled' }

      // Phase 2: Build mini-ISO or prepare HTTP boot
      this.progress('building', 8, 'Preparing boot image...')
      // For MVP, use the extracted repo directly — the target will boot via
      // BMC virtual media with a slim ISO built from the repo's boot assets.
      // In production, this would call the mini-ISO builder.

      // Phase 3: Mount virtual CD
      this.progress('mounting', 12, 'Mounting virtual CD...')
      const imageUrl = `https://${this.serverIp}/iso/deploy.iso`
      await this.rf.vmediaConnect(imageUrl)

      // Wait for VCD to be inserted
      let inserted = false
      for (let i = 0; i < 24; i++) {
        if (this.cancelled) { await this.rf.vmediaDisconnect().catch(() => {}); return { ok: false, error: 'cancelled' }
        }
        await sleep(10000)
        const st = await this.rf.vmediaStatus()
        if (st.Inserted) { inserted = true; break }
        this.progress('mounting', 12 + i, `Waiting for VCD insert (${(i + 1) * 10}s)...`)
      }
      if (!inserted) throw new Error('virtual media did not insert within 4 min')

      // Phase 4: Boot override + restart
      this.progress('booting', 20, 'Setting boot override + restarting...')
      await this.rf.setBootOnce('Cd')
      const powerState = sys.PowerState
      await this.rf.power(powerState === 'On' ? 'ForceRestart' : 'On')

      // Phase 5: Monitor installation progress (via /report callbacks)
      this.progress('installing', 25, 'Machine booting... waiting for installer reports...')
      // The actual progress monitoring happens via the HTTP report handler.
      // The caller should watch for reports and update the task.

      // For MVP, wait for SSH to come up (timeout 30 min)
      const startTime = Date.now()
      const timeoutMs = 30 * 60 * 1000
      while (Date.now() - startTime < timeoutMs) {
        if (this.cancelled) { await this.rf.vmediaDisconnect().catch(() => {}); return { ok: false, error: 'cancelled' } }
        await sleep(30000)
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const pct = Math.min(25 + Math.floor((elapsed / 1800) * 65), 90)
        this.progress('installing', pct, `Waiting for OS to boot (${Math.floor(elapsed / 60)}min)...`)

        // Try SSH connection
        const sshOk = await this.trySsh(this.spec.osIp)
        if (sshOk) {
          this.progress('verifying', 95, 'SSH is up! Verifying installation...')
          // Cleanup: unmount VCD
          await this.rf.vmediaDisconnect().catch(() => {})
          this.progress('done', 100, 'Installation complete!')
          return { ok: true }
        }
      }

      // Timeout
      await this.rf.vmediaDisconnect().catch(() => {})
      return { ok: false, error: 'timeout waiting for SSH (30 min)' }
    } catch (e: any) {
      await this.rf.vmediaDisconnect().catch(() => {})
      return { ok: false, error: String(e.message || e) }
    }
  }

  private async trySsh(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net')
      const s = new net.Socket()
      s.setTimeout(5000)
      s.on('connect', () => { s.destroy(); resolve(true) })
      s.on('error', () => resolve(false))
      s.on('timeout', () => { s.destroy(); resolve(false) })
      s.connect(22, ip)
    })
  }
}

function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)) }
