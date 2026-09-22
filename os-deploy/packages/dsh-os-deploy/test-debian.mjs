// Debian 分支端到端验证（真实 debian13 解包目录 + openEuler efiboot.img）
import * as fs from 'fs'
import * as path from 'path'

const {
  ensureDebianRepoAssets, buildDebianHttpIso, genDebianHttpGrubCfg, genPreseed, FatImage,
} = await import('./lib/engine.js')

const repo = 'E:/qinwei/OSDeploy/repo/debian1360arm64dvd1'
const efiSrc = 'C:/Users/qinwei/os-deploy-repo/openeuler2203ltssp4everythinga/images/efiboot.img'

console.log('--- 1. 资产规范化（幂等） ---')
const a1 = ensureDebianRepoAssets(repo)
if (!a1.ok) throw new Error(a1.error)
const a2 = ensureDebianRepoAssets(repo)  // 幂等
if (!a2.ok) throw new Error(a2.error)
for (const f of ['netboot-kernel', 'netboot-initrd.gz']) {
  const p = path.join(repo, f)
  if (!fs.existsSync(p)) throw new Error(f + ' 未生成')
  console.log(`  ✓ ${f}  ${(fs.statSync(p).size / 1048576).toFixed(1)}MB`)
}

console.log('--- 2. preseed 生成 ---')
const spec = {
  bmc: { host: 'x', user: 'x', pass: 'x' }, nicMac: 'aa:bb', hostname: 'deb01',
  osIp: '192.168.2.167', osGateway: '192.168.2.1', osPrefixLen: 24, osDns: ['8.8.8.8'],
  rootPassword: 'Pw', diskSn: '', distroId: 'debian1360arm64dvd1', vendor: 'debian',
  repoDir: repo, components: ['core'], taskId: 'task_deb1', isoOutDir: process.env.TEMP,
}
const ps = genPreseed(spec, '192.168.2.137', 8080)
for (const must of ['mirror/http/directory string /repo/debian1360arm64dvd1', 'task=task_deb1&stage=post-install']) {
  if (!ps.includes(must)) throw new Error('preseed 缺少: ' + must)
}
console.log('  ✓ preseed 含镜像仓库目录、任务标识回报')

console.log('--- 3. Debian grub.cfg ---')
const grub = genDebianHttpGrubCfg(spec, '192.168.2.137', 8080)
for (const must of [
  'linux (http,192.168.2.137:8080)/repo/debian1360arm64dvd1/netboot-kernel',
  'initrd (http,192.168.2.137:8080)/repo/debian1360arm64dvd1/netboot-initrd.gz',
  'preseed/url=http://192.168.2.137:8080/ks/task_deb1.ks',
  'netcfg/choose_interface=aa:bb',
]) {
  if (!grub.includes(must)) throw new Error('grub.cfg 缺少: ' + must)
}
console.log('  ✓ kernel/initrd 从仓库根 netboot-* 拉取，preseed 走 /ks')

console.log('--- 4. 构建迷你 ISO（借用 openEuler efiboot.img） ---')
const out = path.join(process.env.TEMP || '/tmp', 'osd-test-deb.iso')
const info = await buildDebianHttpIso({
  repoDir: repo, label: 'OSDEPLOY_TASK_DEB1', grubCfg: grub, out,
  grubBootImage: fs.readFileSync(efiSrc),
})
console.log(`  ISO: ${(info.size / 1048576).toFixed(1)}MB（应为 ~4-8MB 级别）`)
if (info.size > 20 * 1048576) throw new Error('Debian 迷你 ISO 异常大')

console.log('--- 5. 引导镜像内 grub.cfg 校验 ---')
const fd = fs.openSync(out, 'r')
const boot = Buffer.alloc(fs.statSync(efiSrc).size)
fs.readSync(fd, boot, 0, boot.length, 20 * 2048)
fs.closeSync(fd)
const fat = new FatImage(boot)
const g = fat.listAll().find(f => !f.dir && /GRUB\.CFG$/i.test(f.path))
if (!g?.data?.toString().includes('netboot-kernel')) throw new Error('引导镜像内 grub.cfg 未含 netboot-kernel')
console.log('  ✓ efiboot.img 内 grub.cfg 已替换为 HTTP-boot 配置')

fs.rmSync(out, { force: true })
console.log('\n全部通过 ✓')
