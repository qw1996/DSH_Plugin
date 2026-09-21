// 对比 openEuler / 麒麟 的 efiboot.img 内部结构 + 检查实际构建的麒麟迷你 ISO
import * as fs from 'fs'
import * as path from 'path'

const { FatImage } = await import('./lib/engine.js')

const isoDir = 'C:/Users/qinwei/os-deploy-iso'
console.log('--- 已构建的迷你 ISO ---')
for (const f of fs.readdirSync(isoDir)) {
  const st = fs.statSync(path.join(isoDir, f))
  console.log(`  ${f}  ${(st.size / 1048576).toFixed(0)}MB`)
}

const kylinRepo = 'C:/Users/qinwei/os-deploy-repo/kylinserverv10sp32403release20'
const oeRepo = 'C:/Users/qinwei/os-deploy-repo/openeuler2203ltssp4everythinga'

function listFat(label, file) {
  console.log(`\n--- ${label}: ${file} ---`)
  const fat = new FatImage(fs.readFileSync(file))
  for (const f of fat.listAll()) {
    console.log(`  ${f.dir ? '[D]' : '[F]'} /${f.path}${f.dir ? '' : ` (${f.size}B)`}`)
  }
}

listFat('麒麟 efiboot.img（解包仓库原始）', path.join(kylinRepo, 'images', 'efiboot.img'))
listFat('openEuler efiboot.img（对照）', path.join(oeRepo, 'images', 'efiboot.img'))

// 也看看两个 distro 的 images/pxeboot 与 .treeinfo/.discinfo
for (const [label, repo] of [['麒麟', kylinRepo], ['openEuler', oeRepo]]) {
  console.log(`\n--- ${label} 仓库关键资产 ---`)
  for (const p of ['images/pxeboot/vmlinuz', 'images/pxeboot/initrd.img', 'images/install.img', '.treeinfo', '.discinfo']) {
    const fp = path.join(repo, p)
    console.log(`  ${fs.existsSync(fp) ? '✓' : '✗'} ${p}${fs.existsSync(fp) && !p.includes('/') ? '' : ''}`)
  }
}
