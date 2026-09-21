// 验证麒麟 slim 迷你 ISO：尺寸 / grub.cfg 参数 / ks.cfg 回报标识
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

const { buildMiniIso, FatImage, genVmediaGrubCfg, genKickstart } = await import('./lib/engine.js')

const kylinRepo = 'C:/Users/qinwei/os-deploy-repo/kylinserverv10sp32403release20'
const out = path.join(process.env.TEMP || '/tmp', 'osd-test-kylin-slim.iso')

const spec = {
  bmc: { host: '192.168.2.14', user: 'x', pass: 'x' },
  nicMac: '44:A1:91:E6:B1:CC', hostname: 'qinwei',
  osIp: '192.168.2.167', osGateway: '192.168.2.1', osPrefixLen: 24,
  osDns: ['114.114.114.114'], rootPassword: 'Test123456', diskSn: '033FKPFSKB001535',
  distroId: 'kylinserverv10sp32403release20', vendor: 'kylin',
  repoDir: kylinRepo, components: ['core'],
  taskId: 'task_abc123', isoOutDir: path.dirname(out),
}
const label = ('OSDEPLOY_' + spec.taskId).toUpperCase()
const ks = genKickstart(spec, '192.168.2.137', 8080)
const grub = genVmediaGrubCfg(spec, label, { slim: true, serverIp: '192.168.2.137', httpPort: 8080 })

console.log('--- grub.cfg (slim) ---')
console.log(grub)
for (const must of [
  `inst.stage2=http://192.168.2.137:8080/repo/${spec.distroId}/`,
  'ifname=netboot0:44:a1:91:e6:b1:cc',
  'ip=192.168.2.167::192.168.2.1:255.255.255.0:qinwei:netboot0:none',
  'nameserver=114.114.114.114',
  `inst.ks=hd:LABEL=${label}:/ks.cfg`,
]) {
  if (!grub.includes(must)) throw new Error('grub.cfg 缺少: ' + must)
}
console.log('✓ slim 引导参数齐全')

console.log('--- ks.cfg 回报标识 ---')
for (const must of ['task=task_abc123&stage=post-install', 'task=task_abc123&stage=firstboot', '--data-urlencode "task=task_abc123"']) {
  if (!ks.includes(must)) throw new Error('ks.cfg 缺少: ' + must)
}
console.log('✓ 回报 URL 均带任务标识')

console.log('--- 构建 slim 迷你 ISO ---')
const info = await buildMiniIso({ repoDir: kylinRepo, label, ks, grubCfg: grub, grubCfgPath: '/EFI/BOOT/GRUB.CFG', out, slim: true })
const mb = (info.size / 1048576).toFixed(1)
console.log(`ISO: ${mb}MB（full 模式为 982MB）`)
if (info.size > 150 * 1048576) throw new Error('slim ISO 超过 150MB——install.img 仍被打入')

const list = execFileSync('tar', ['-tf', out], { encoding: 'utf8', timeout: 60000 }).trim().split(/\r?\n/)
console.log('内容:', list.join(' | '))
if (list.some(l => /install\.img/i.test(l))) throw new Error('slim ISO 不应包含 install.img')

// 引导镜像内的 grub.cfg 校验
const fd = fs.openSync(out, 'r')
const boot = Buffer.alloc(info.bootImageSize)
fs.readSync(fd, boot, 0, info.bootImageSize, 20 * 2048)
fs.closeSync(fd)
const fat = new FatImage(boot)
const g = fat.listAll().find(f => !f.dir && /GRUB\.CFG$/i.test(f.path))
if (!g?.data?.toString().includes('inst.stage2=http://')) throw new Error('引导镜像内 grub.cfg 未含 slim 参数')
console.log('✓ 引导镜像内 grub.cfg 为 slim 版')
console.log('\n全部通过 ✓')
fs.rmSync(out, { force: true })
