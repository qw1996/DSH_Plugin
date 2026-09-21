// 迷你 ISO 端到端验证（真实 openEuler everything 解包资产）
// 1. buildMiniIso 产出真实可引导 ISO
// 2. tar(bsdtar) 解析 ISO9660 内容
// 3. 回读引导镜像（El Torito LBA 20）校验 grub.cfg 已替换
// 4. getRouteIp 路由选路
// 5. DeployHttpServer TLS :443 服务 /iso
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

const repo = 'C:/Users/qinwei/os-deploy-repo/openeuler2203ltssp4everythinga'
const out = path.join(process.env.TEMP || '/tmp', 'osd-test-mini.iso')
const { buildMiniIso, FatImage, genVmediaGrubCfg, genKickstart, getRouteIp, DeployHttpServer, DEFAULT_TLS_CERT, DEFAULT_TLS_KEY } = await import('./lib/engine.js')

const spec = {
  bmc: { host: '192.168.2.14', user: 'x', pass: 'x' },
  nicMac: '44:a1:91:e6:b1:cc', hostname: 'srv-01',
  osIp: '192.168.2.167', osGateway: '192.168.2.1', osPrefixLen: 24,
  osDns: ['114.114.114.114'], rootPassword: 'Test123456', diskSn: '',
  distroId: 'openeuler2203ltssp4everythinga', vendor: 'openEuler',
  repoDir: repo, components: ['core'],
  taskId: 'task_test1234', isoOutDir: path.dirname(out),
}
const label = ('OSDEPLOY_' + spec.taskId).toUpperCase().slice(0, 32)
console.log('--- 1. 构建迷你 ISO ---')
const t0 = Date.now()
const ks = genKickstart(spec, '192.168.2.137', 8080)
const grub = genVmediaGrubCfg(spec, label)
if (!grub.includes(`inst.ks=hd:LABEL=${label}:/ks.cfg`)) throw new Error('grub.cfg 缺少 inst.ks 参数')
if (!grub.includes(`inst.stage2=hd:LABEL=${label}`)) throw new Error('grub.cfg 缺少 inst.stage2 参数')
const info = await buildMiniIso({
  repoDir: repo, label, ks, grubCfg: grub,
  grubCfgPath: '/EFI/BOOT/GRUB.CFG', out,
})
console.log(`ISO: ${out} (${(info.size / 1048576).toFixed(1)}MB, boot image ${(info.bootImageSize / 1048576).toFixed(1)}MB, 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`)

console.log('--- 2. ISO9660 内容（bsdtar 解析） ---')
const list = execFileSync('tar', ['-tf', out], { encoding: 'utf8', timeout: 60000 }).trim().split(/\r?\n/)
console.log('条目:', list.join(' | '))
for (const need of ['ks.cfg', 'images/pxeboot/vmlinuz', 'images/pxeboot/initrd.img', 'images/install.img', 'EFI/BOOT/grub.cfg', '.disk/info']) {
  if (!list.some(l => l.toLowerCase() === need.toLowerCase())) throw new Error(`ISO 缺少 ${need}`)
}
console.log('✓ 关键文件齐全')

console.log('--- 3. 引导镜像 grub.cfg 回读校验 ---')
const fd = fs.openSync(out, 'r')
const boot = Buffer.alloc(info.bootImageSize)
fs.readSync(fd, boot, 0, info.bootImageSize, 20 * 2048) // El Torito bootLBA=20
fs.closeSync(fd)
const fat = new FatImage(boot)
const files = fat.listAll()
const grubEntry = files.find(f => !f.dir && /GRUB\.CFG$/i.test(f.path))
if (!grubEntry || !grubEntry.data) throw new Error('efiboot.img 内找不到 GRUB.CFG')
const grubContent = grubEntry.data.toString('utf8')
if (!grubContent.includes('osdeploy generated (virtual media) grub.cfg')) throw new Error('引导镜像内 grub.cfg 未被替换！')
if (!grubContent.includes('inst.ks=hd:LABEL=')) throw new Error('引导镜像内 grub.cfg 缺少 inst.ks')
console.log('✓ efiboot.img 内 grub.cfg 已替换为自动安装配置')

console.log('--- 4. 路由选路 getRouteIp ---')
const ip = await getRouteIp('192.168.2.14')
console.log(`通往 192.168.2.14 的本机源 IP: ${ip}`)
if (ip !== '192.168.2.137') throw new Error(`预期 192.168.2.137，得到 ${ip}`)

console.log('--- 5. HTTPS :443 服务 /iso ---')
const srv = new DeployHttpServer(18080, 8443)
const isoDir = path.dirname(out)
srv.setRoot('/iso', isoDir)
await srv.start({ cert: DEFAULT_TLS_CERT, key: DEFAULT_TLS_KEY })
await new Promise(r => setTimeout(r, 800))
if (!srv.httpsUp) throw new Error('HTTPS 服务未起来: ' + srv.httpsError)
// Node fetch 自签证书需要 rejectUnauthorized:false
const https = await import('https')
const body = await new Promise((resolve, reject) => {
  https.get(`https://127.0.0.1:8443/iso/${path.basename(out)}`, { rejectUnauthorized: false }, res => {
    let len = 0
    res.on('data', c => { len += c.length; if (len > 1024 * 1024) res.destroy() })
    res.on('end', () => resolve({ status: res.statusCode, len }))
    res.on('close', () => resolve({ status: res.statusCode, len }))
  }).on('error', reject)
})
console.log(`HTTPS 拉取 ISO: HTTP ${body.status}, ≥${(body.len / 1048576).toFixed(1)}MB 接收成功`)
if (body.status !== 200) throw new Error('HTTPS 拉取失败')
srv.stop()

console.log('\n全部验证通过 ✓')
fs.rmSync(out, { force: true })
