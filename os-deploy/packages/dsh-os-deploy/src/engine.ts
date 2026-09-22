// engine.ts — core deployment engine (adapted from the proven osdeploy project)
// Handles: BMC Redfish (virtual media, boot override, power), kickstart/preseed
// generation, mini-ISO building, HTTP serving, progress monitoring.

import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import * as https from 'https'
import * as crypto from 'crypto'
import * as os from 'os'
import * as dgram from 'dgram'
import { buildMiniIso } from './miniiso'
// 重导出：lib/engine.js 作为独立入口供测试/调试直接使用
export { buildMiniIso, FatImage, patchFatFile } from './miniiso'
export { DEFAULT_TLS_CERT, DEFAULT_TLS_KEY } from './certs'

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
  diskSn: string             // 目标磁盘 SN（空 = 安装期自动选第一块盘）
  distroId: string
  vendor: string             // 'openEuler' | 'kylin' | 'debian'
  repoDir: string            // extracted ISO directory
  components: string[]       // package groups / explicit packages
  taskId: string             // 用于迷你 ISO 命名与挂载校验
  isoOutDir: string          // 迷你 ISO 输出目录（HTTPS /iso 根）
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

  /**
   * 从 Chassis/Drives 枚举物理盘。鲲鹏 iBMC 等固件不实现
   * Systems/1/Storage（404），磁盘挂在 Chassis 下：
   *   /redfish/v1/Chassis/{id} → Drives → /redfish/v1/Chassis/{id}/Drives/{disk}
   */
  async getChassisDrives(): Promise<any[]> {
    try {
      const col = await this.get('/redfish/v1/Chassis')
      if (col.status !== 200 || !col.json) return []
      const drives: any[] = []
      for (const m of (col.json.Members || [])) {
        const ch = await this.get(m['@odata.id'])
        if (ch.status !== 200 || !ch.json || !ch.json.Drives) continue
        const dcol = await this.get(ch.json.Drives['@odata.id'])
        if (dcol.status !== 200 || !dcol.json) continue
        for (const dl of (dcol.json.Members || [])) {
          const dr = await this.get(dl['@odata.id'])
          if (dr.status === 200 && dr.json) drives.push(dr.json)
        }
      }
      return drives
    } catch (e) { return [] }
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
__R() { curl -s -m 8 -G --data-urlencode "m=deploy" --data-urlencode "task=${spec.taskId}" --data-urlencode "stage=$1" --data-urlencode "d=$2" "http://${serverIp}:${httpPort}/report" >/dev/null 2>&1 || true; }
__R pre-start
# SN 归一化：去所有空白 + 统一大写（BMC Redfish 与 lsblk/vpd_pg80 的
# 序列号格式可能不同：填充空格、大小写、厂商前缀）
__N() { echo "$1" | tr -d ' \\t\\r\\n' | tr 'a-z' 'A-Z'; }
TARGET_SN="$(__N '${spec.diskSn}')"
TARGET=""
DISKLIST=""
for d in $(lsblk -dn -o NAME,TYPE | awk '$2=="disk"{print $1}'); do
  sn="$(__N "$(lsblk -dn -o SERIAL /dev/$d 2>/dev/null)")"
  # lsblk SERIAL 为空/异常时读 SCSI VPD0x80（厂商 SN 所在页）
  if [ -z "$sn" ] || [ "$sn" = "0" ]; then
    sn="$(__N "$(cat /sys/block/$d/device/vpd_pg80 2>/dev/null | tr -d '\\0')")"
  fi
  DISKLIST="$DISKLIST$d:$sn; "
  # 双向包含比对：容忍 padding/前缀差异（SN 均 ≥10 字符，误包含风险极低）
  if [ -n "$TARGET_SN" ] && [ -n "$sn" ]; then
    case "$sn" in *"$TARGET_SN"*) TARGET="$d" ;; esac
    if [ -z "$TARGET" ]; then
      case "$TARGET_SN" in *"$sn"*) TARGET="$d" ;; esac
    fi
  fi
done
__R disks "target='' sn=$TARGET_SN all=$DISKLIST"
if [ -z "$TARGET" ]; then
  if [ -z "$TARGET_SN" ]; then
    # 未指定磁盘 → 自动选第一块盘（单盘服务器常规形态）
    TARGET=$(lsblk -dn -o NAME,TYPE | awk '$2=="disk"{print $1}' | head -n1)
    [ -n "$TARGET" ] && __R disk-autopick "$TARGET"
  else
    # 指定了磁盘但未匹配 → 必须中止（绝不能静默装到别的盘上！）
    __R fatal "disk SN $TARGET_SN not found in: $DISKLIST"
    sleep 5
    exit 1
  fi
fi
__R disk-resolved "$TARGET ($DISKLIST)"
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
curl -s -m 8 "http://${serverIp}:${httpPort}/report?m=deploy&task=${spec.taskId}&stage=post-install" >/dev/null 2>&1 || true
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
ExecStart=/usr/bin/curl -s -m 10 "http://${serverIp}:${httpPort}/report?m=deploy&task=${spec.taskId}&stage=firstboot"
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
  in-target curl -s -m 10 "${base}/../report?m=deploy&task=${spec.taskId}&stage=post-install" || true
`
}

// ---------- 虚拟光驱 mini-ISO 的 grub.cfg ----------
/**
 * 固化进迷你 ISO（efiboot.img 内 /EFI/BOOT/GRUB.CFG + ISO9660 /EFI/BOOT/grub.cfg）
 * 的引导配置。两种模式（原 osdeploy 工具实证）：
 *  - full：inst.stage2=hd:LABEL=<label>（stage2 install.img 在光盘上，
 *    ISO ~800-980MB；openEuler 验证可行）
 *  - slim：inst.stage2=http://<ip>:<port>/repo/<distroId>/（stage2 走 HTTP 仓库，
 *    ISO 仅 ~70MB；麒麟实证可行——大 ISO 的虚拟光驱引导链路撑不住）。
 *    slim 需要 dracut 期网络：ifname= 把业务网卡 MAC 绑定自定义名
 *    （绕开 openEuler 系 dracut 055 的 enx<MAC> off-by-one 缺陷），ip= 静态配置。
 */
export function genVmediaGrubCfg(spec: DeploySpec, isoLabel: string, opts?: {
  slim?: boolean; serverIp?: string; httpPort?: number
}): string {
  const slim = !!opts?.slim
  const kargs: string[] = []
  if (slim) {
    const serverIp = opts?.serverIp || ''
    const httpPort = opts?.httpPort || 8080
    kargs.push(`inst.stage2=http://${serverIp}:${httpPort}/repo/${spec.distroId}/`)
    // dracut 期静态网络（stage2 要从 HTTP 拉取）
    const mac = String(spec.nicMac || '').toLowerCase()
    const mask = prefixToMask(spec.osPrefixLen)
    if (mac) kargs.push(`ifname=netboot0:${mac}`)
    kargs.push(`ip=${spec.osIp}::${spec.osGateway}:${mask}:${spec.hostname || 'osdeploy'}:netboot0:none`)
    kargs.push(`nameserver=${(spec.osDns || ['114.114.114.114'])[0]}`)
  } else {
    kargs.push(`inst.stage2=hd:LABEL=${isoLabel}`)
  }
  kargs.push(
    `inst.ks=hd:LABEL=${isoLabel}:/ks.cfg`,
    `ro`,
    `inst.geoloc=0`,
    `inst.cmdline`,
    `console=tty0 console=ttyS0,115200n8`,
    `smmu.bypassdev=0x1000:0x17`,
    `smmu.bypassdev=0x1000:0x15`,
    `video=efifb:off`,
    `fpi_to_tail=off`,
  )
  return `# osdeploy generated (virtual media${slim ? ', slim' : ''}) grub.cfg for ${spec.hostname || spec.osIp}
set default=0
set timeout=3
menuentry 'osdeploy ${spec.distroId} (${spec.hostname || spec.osIp})' --class gnu-linux {
  search --no-floppy --set=root -l '${isoLabel}'
  linux /images/pxeboot/vmlinuz ${kargs.join(' ')}
  initrd /images/pxeboot/initrd.img
}
`
}

/** Debian HTTP 引导 grub.cfg：kernel/initrd 由 grub 自身网络栈经 HTTP 拉取。 */
export function genDebianHttpGrubCfg(spec: DeploySpec, serverIp: string, httpPort: number): string {
  const mask = prefixToMask(spec.osPrefixLen)
  const kargs = [
    'auto=true', 'priority=critical',
    `preseed/url=http://${serverIp}:${httpPort}/ks/${spec.taskId}.ks`,
    'locale=en_US.UTF-8',
    'keymap=us',
    'netcfg/disable_autoconfig=true',
    `netcfg/choose_interface=${spec.nicMac}`,
    'netcfg/link_wait_timeout=15',
    `netcfg/get_ipaddress=${spec.osIp}`,
    `netcfg/get_netmask=${mask}`,
    `netcfg/get_gateway=${spec.osGateway}`,
    `netcfg/get_nameservers=${(spec.osDns || ['114.114.114.114']).join(' ')}`,
    'netcfg/confirm_static=true',
    `netcfg/get_hostname=${spec.hostname}`,
    'console=tty0', 'console=ttyS0,115200n8',
  ].join(' ')
  return `# osdeploy generated grub.cfg — Debian HTTP boot
set default=0
set timeout=5
menuentry 'osdeploy ${spec.distroId} (${spec.hostname || spec.osIp})' --class gnu-linux {
  net_add_addr e0 efinet0 ${spec.osIp}
  linux (http,${serverIp}:${httpPort})/repo/${spec.distroId}/netboot/netboot-kernel ${kargs}
  initrd (http,${serverIp}:${httpPort})/repo/${spec.distroId}/netboot/netboot-initrd.gz
}
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
  private tlsServer: https.Server | null = null
  private port: number
  private tlsPort: number
  private roots: Map<string, string> = new Map() // urlPrefix -> dir
  private reportHandler: ((query: URLSearchParams, ip: string) => void) | null = null
  private isoAccessHandler: ((info: { count: number; method: string; status: number; ip: string }) => void) | null = null
  private isoFetchCount = 0
  /** HTTPS 443 是否成功监听（iBMC 虚拟光驱要求 https:// 镜像 URL） */
  httpsUp = false
  httpsError = ''

  constructor(port: number, tlsPort = 443) {
    this.port = port
    this.tlsPort = tlsPort
  }

  setRoot(prefix: string, dir: string) { this.roots.set(prefix, dir) }
  removeRoot(prefix: string) { this.roots.delete(prefix) }
  onReport(handler: (query: URLSearchParams, ip: string) => void) { this.reportHandler = handler }
  /** /iso/* 拉取回调（BMC 拉取虚拟光驱镜像的节流日志：第 1 次及每 50 次一条） */
  onIsoAccess(handler: (info: { count: number; method: string; status: number; ip: string }) => void) {
    this.isoAccessHandler = handler
  }

  start(tls?: { cert: string; key: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
        try { this.handle(req, res) } catch (e) {
          res.writeHead(500); res.end('error')
        }
      }
      this.server = http.createServer(handler)
      this.server.on('error', reject)
      this.server.listen(this.port, '0.0.0.0', () => {
        resolve()
        // TLS 与 HTTP 共用 handler；监听失败不致命（记录状态，任务挂载期报错）
        if (tls && tls.cert && tls.key) {
          this.tlsServer = https.createServer({ cert: tls.cert, key: tls.key }, handler)
          this.tlsServer.on('error', (e: Error) => {
            this.httpsUp = false
            this.httpsError = String((e as any)?.code || e.message)
            console.error(`[osdeploy] HTTPS :${this.tlsPort} listen failed: ${this.httpsError} (虚拟光驱将不可用)`)
          })
          this.tlsServer.listen(this.tlsPort, '0.0.0.0', () => {
            this.httpsUp = true
            console.log(`[osdeploy] HTTPS server listening on 0.0.0.0:${this.tlsPort} (虚拟光驱)`)
          })
        } else {
          this.httpsError = 'no TLS certificate'
        }
      })
    })
  }

  stop() {
    if (this.server) { this.server.close(); this.server = null }
    if (this.tlsServer) { this.tlsServer.close(); this.tlsServer = null }
    this.httpsUp = false
  }

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
      // BMC 拉取虚拟光驱镜像（iBMC 以大量小 Range 请求流式读取）——节流记录
      if (prefix === '/iso' && this.isoAccessHandler) {
        this.isoFetchCount++
        if (this.isoFetchCount === 1 || this.isoFetchCount % 50 === 0) {
          try { this.isoAccessHandler({ count: this.isoFetchCount, method: req.method || '', status: code, ip }) } catch { /* ignore */ }
        }
      }
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
  /** 本任务收到的安装器回报阶段（成功判定的证据；见 markReport） */
  private stages = new Set<string>()

  constructor(spec: DeploySpec, serverIp: string, httpPort: number, progress: ProgressCallback) {
    this.spec = spec
    this.serverIp = serverIp
    this.httpPort = httpPort
    this.progress = progress
    this.rf = new RedfishClient(spec.bmc)
  }

  cancel() { this.cancelled = true }

  /**
   * 安装器回报入口（由 service 的 /report 处理器调用）。
   * 回报 URL 携带 task=<id>，因此旧系统开机自报（带上一个任务的 id）
   * 不会计入本任务——这是"安装是否真的发生"的判据。
   */
  markReport(stage: string) {
    if (!this.stages.has(stage)) {
      this.stages.add(stage)
      this.progress('installing', -1, `[installer] ${stage}`)
    }
  }

  async run(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Phase 1: Preflight (inventory)
      this.progress('preflight', 2, 'Probing BMC...')
      const sys = await this.rf.getSystem()
      this.progress('preflight', 5, `BMC ok: ${sys.Model || 'unknown'} power=${sys.PowerState}`)

      if (this.cancelled) return { ok: false, error: 'cancelled' }

      // Phase 2/3: 构建每机迷你启动 ISO 并挂载为虚拟光驱
      // iBMC 的 VmmControl 只接受 https:// 镜像 URL（http 报
      // FileTransferProtocolMismatch）。不能挂完整 DVD（17GB），构建迷你
      // 启动盘。两种模式（原 osdeploy 工具实证）：
      //  - full：kernel+initrd+ks+stage2 都在光盘（openEuler ~810MB 验证可行）
      //  - slim：光盘只放 kernel+initrd+ks（~70MB），stage2 与软件包走
      //    HTTP 仓库（麒麟验证可行——982MB 的 full 光盘其虚拟光驱引导链路
      //    撑不住：内核起不来，固件回落旧盘启动，被旧系统 SSH 误判成功）
      const slim = this.spec.vendor === 'kylin'
      this.progress('building', 8, `Building per-machine mini boot ISO [${slim ? 'slim' : 'full'}]...`)
      const isoLabel = ('OSDEPLOY_' + this.spec.taskId).toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 32)
      const isoOut = path.join(this.spec.isoOutDir, `${this.spec.taskId}.iso`)
      const ks = genKickstart(this.spec, this.serverIp, this.httpPort)
      const grub = genVmediaGrubCfg(this.spec, isoLabel, { slim, serverIp: this.serverIp, httpPort: this.httpPort })
      const binfo = await buildMiniIso({
        repoDir: this.spec.repoDir, label: isoLabel, ks, grubCfg: grub,
        grubCfgPath: '/EFI/BOOT/GRUB.CFG', out: isoOut, slim,
      })
      const isoMB = Math.round(binfo.size / 1048576)
      this.progress('building', 11, `Mini boot ISO ready: ${isoOut} (${isoMB}MB, boot image ${(binfo.bootImageSize / 1048576).toFixed(1)}MB)`)

      this.progress('mounting', 12, 'Mounting virtual CD...')
      const imageUrl = `https://${this.serverIp}/iso/${this.spec.taskId}.iso`
      // 先卸掉已挂载的镜像，确保 BMC 重新下载我们的
      try {
        const cur = await this.rf.vmediaStatus()
        if (cur && cur.Inserted) {
          this.progress('mounting', 13, `Unmounting existing virtual media (${cur.Image || 'unknown image'})`)
          try { await this.rf.vmediaDisconnect() } catch { /* ignore */ }
          await sleep(8000)
        }
      } catch { /* 状态查询失败则继续 */ }
      this.progress('mounting', 14, `Mounting virtual CD from ${imageUrl} ...`)
      await this.rf.vmediaConnect(imageUrl)

      // iBMC 挂载是异步任务（BMC 下载镜像）——轮询直到 Inserted 且镜像匹配。
      // 超时按镜像尺寸放宽：BMC 侧下载 ~800MB 需数分钟。
      const mountTimeoutMs = isoMB <= 400 ? 240000 : 600000
      let inserted = false
      const t0 = Date.now()
      let poll = 0
      while (Date.now() - t0 < mountTimeoutMs) {
        if (this.cancelled) { await this.rf.vmediaDisconnect().catch(() => {}); return { ok: false, error: 'cancelled' } }
        const vmst = await this.rf.vmediaStatus()
        if (vmst.Inserted) {
          const imgOk = !vmst.Image || String(vmst.Image).includes(`${this.spec.taskId}.iso`)
          if (imgOk) {
            inserted = true
            this.progress('mounting', 18, `Virtual CD mounted (Image=${vmst.Image})`)
            break
          }
          // 挂了别的镜像 → 替换
          this.progress('mounting', 15, `Different image mounted (${vmst.Image}) -> disconnecting and retrying`)
          try { await this.rf.vmediaDisconnect(); await sleep(5000); await this.rf.vmediaConnect(imageUrl) } catch { /* ignore */ }
        }
        await sleep(5000)
        poll++
        if (poll % 4 === 0) {
          const waited = Math.round((Date.now() - t0) / 1000)
          this.progress('mounting', 15, `Waiting for VCD insert (${waited}s/${Math.round(mountTimeoutMs / 1000)}s, ISO ${isoMB}MB)`)
        }
      }
      if (!inserted) {
        throw new Error(`virtual media did not insert within ${Math.round(mountTimeoutMs / 60000)} min (ISO ${isoMB}MB; 检查 BMC 到 ${this.serverIp}:443 的连通性/证书)`)
      }

      // Phase 4: Boot override + restart
      this.progress('booting', 20, 'Setting boot override + restarting...')
      await this.rf.setBootOnce('Cd')
      const powerState = sys.PowerState
      await this.rf.power(powerState === 'On' ? 'ForceRestart' : 'On')

      // Phase 5: Monitor installation progress (via /report callbacks)
      this.progress('installing', 25, 'Machine booting... waiting for installer reports...')
      // The actual progress monitoring happens via the HTTP report handler.
      // The caller should watch for reports and update the task.

      // 等待安装完成：SSH 可达 + 本任务收到安装器回报（post-install 或
      // firstboot，URL 带 task=<本任务 id>）双重判据。仅凭 SSH 会把"引导
      // 失败回落旧系统"误判成成功（旧系统 SSH 也在）。
      const startTime = Date.now()
      const timeoutMs = 30 * 60 * 1000
      while (Date.now() - startTime < timeoutMs) {
        if (this.cancelled) { await this.rf.vmediaDisconnect().catch(() => {}); return { ok: false, error: 'cancelled' } }
        await sleep(30000)
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const evidence = this.stages.has('post-install') || this.stages.has('firstboot')
        const pct = Math.min(25 + Math.floor((elapsed / 1800) * 65), 90)
        this.progress('installing', pct, `Waiting for OS to boot (${Math.floor(elapsed / 60)}min${evidence ? ', 安装器已回报' : ''})...`)

        // Try SSH connection
        const sshOk = await this.trySsh(this.spec.osIp)
        if (sshOk) {
          if (!evidence) {
            // SSH 通但从未收到本任务的安装器回报：大概率引导失败、回落旧系统
            await this.rf.vmediaDisconnect().catch(() => {})
            return {
              ok: false,
              error: '机器 SSH 可达，但未收到本次安装的安装器回报——很可能虚拟光驱引导失败后回落启动了旧系统（旧系统 SSH 同样可达）。请检查 BMC 远程控制台确认引导过程；若确认已实际装好（登录查看 /etc/os-release），可忽略此判定。',
            }
          }
          this.progress('verifying', 95, 'SSH is up + installer reports received!')
          // Cleanup: unmount VCD
          await this.rf.vmediaDisconnect().catch(() => {})
          this.progress('done', 100, 'Installation complete!')
          return { ok: true }
        }
      }

      // Timeout
      await this.rf.vmediaDisconnect().catch(() => {})
      const gotStages = [...this.stages].join(',') || '无'
      return { ok: false, error: `timeout waiting for SSH (30 min)；已收到的安装器回报: ${gotStages}` }
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

/**
 * 探测"通往目标（BMC）的本机源 IP"——用 UDP connect 让系统路由栈选路，
 * 不实际发包。多网卡/VPN 场景下比"第一个非内网 IPv4"可靠：BMC 必须能
 * 回连到我们选的地址（虚拟光驱 HTTPS 与安装期 HTTP 仓库都依赖它）。
 * 探测失败时退化为任意非内网 IPv4。
 */
export function getRouteIp(target: string): Promise<string> {
  return new Promise((resolve) => {
    const fallback = () => {
      const ifs = os.networkInterfaces()
      for (const name of Object.keys(ifs)) {
        const list = ifs[name]
        if (!list) continue
        for (const i of list) {
          if (i.family === 'IPv4' && !i.internal) return resolve(i.address)
        }
      }
      resolve('127.0.0.1')
    }
    try {
      const s = dgram.createSocket('udp4')
      const timer = setTimeout(() => { try { s.close() } catch { /* ignore */ } fallback() }, 3000)
      s.once('error', () => { clearTimeout(timer); try { s.close() } catch { /* ignore */ } fallback() })
      s.connect(443, target, () => {
        const addr = s.address()
        clearTimeout(timer)
        const ip = addr && typeof addr === 'object' ? (addr as any).address : ''
        try { s.close() } catch { /* ignore */ }
        if (ip && !ip.startsWith('127.')) resolve(ip)
        else fallback()
      })
    } catch {
      fallback()
    }
  })
}
