// 验证日志增强：syslog 收集器（UDP/TCP）+ grub 参数 + ks 回报
import * as dgram from 'dgram'
import * as net from 'net'

const { SyslogCollector, genVmediaGrubCfg, genKickstart } = await import('./lib/engine.js')

// 1. grub.cfg 引导参数（slim 与 full 都要有 syslog 推送参数）
const spec = {
  bmc: { host: 'x', user: 'x', pass: 'x' }, nicMac: 'aa:bb', hostname: 'h',
  osIp: '1.2.3.4', osGateway: '1.2.3.1', osPrefixLen: 24, osDns: ['8.8.8.8'],
  rootPassword: 'Pw', diskSn: '', distroId: 'd', vendor: 'kylin',
  repoDir: 'r', components: ['core'], taskId: 't1', isoOutDir: 'o',
}
for (const slim of [true, false]) {
  const g = genVmediaGrubCfg(spec, 'LBL', { slim, serverIp: '192.168.2.137', httpPort: 8080 })
  if (!g.includes('inst.remotelog=192.168.2.137:514')) throw new Error(`slim=${slim}: 缺 inst.remotelog`)
  if (!g.includes('rd.syslog=192.168.2.137')) throw new Error(`slim=${slim}: 缺 rd.syslog`)
}
console.log('✓ grub.cfg 两模式均含 inst.remotelog + rd.syslog')

// 2. ks.cfg 回报点
const ks = genKickstart(spec, '192.168.2.137', 8080)
for (const must of ['net-config', 'post-ssh', 'post-service']) {
  if (!ks.includes(must)) throw new Error('ks 缺少回报: ' + must)
}
console.log('✓ ks.cfg 含 net-config / post-ssh / post-service 回报')

// 3. syslog 收集器实测（UDP + TCP）
const col = new SyslogCollector(5514, undefined)
const got = []
col.onLine = ({ ip, severity, msg }) => got.push(`sev=${severity} ip=${ip} ${msg}`)
await col.start()
await new Promise(r => setTimeout(r, 300))
// UDP 发一条 <142>anaconda: Installing glibc-2.28...
const u = dgram.createSocket('udp4')
u.send(Buffer.from('<142>anaconda: Installing glibc-2.28-90.el8.aarch64'), 5514, '127.0.0.1', () => u.close())
// TCP 发一条
const s = net.connect(5514, '127.0.0.1', () => {
  s.write('<142>anaconda: packages installed successfully\n')
  s.end()
})
await new Promise(r => setTimeout(r, 500))
col.stop()
for (const g of got) console.log('  收到: ' + g)
if (!got.some(g => g.includes('Installing glibc'))) throw new Error('UDP 消息未收到')
if (!got.some(g => g.includes('packages installed'))) throw new Error('TCP 消息未收到')
if (!got.some(g => g.includes('sev=6'))) throw new Error('severity 解析错误（142%8=6）')
console.log('✓ syslog 收集器 UDP+TCP 均工作，severity 解析正确')
console.log('\n全部通过 ✓')
