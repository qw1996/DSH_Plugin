// 检查实际构建的麒麟迷你 ISO：内容 / PVD 卷标 / 引导镜像内 grub.cfg
import * as fs from 'fs'
import * as path from 'path'
import { execFileSync } from 'child_process'

const { FatImage } = await import('./lib/engine.js')
const iso = 'C:/Users/qinwei/os-deploy-iso/task_1ae261d872bb.iso'

console.log('--- 1. ISO 内容（bsdtar） ---')
const list = execFileSync('tar', ['-tf', iso], { encoding: 'utf8', timeout: 120000 }).trim().split(/\r?\n/)
console.log(list.join(' | '))

console.log('\n--- 2. PVD 卷标（LBA 16，offset 40，32字节） ---')
const fd = fs.openSync(iso, 'r')
const pvd = Buffer.alloc(2048)
fs.readSync(fd, pvd, 0, 2048, 16 * 2048)
const label = pvd.toString('ascii', 40, 72).trim()
console.log(`卷标: "${label}"（长度 ${label.length}）`)

console.log('\n--- 3. El Torito 引导镜像内 grub.cfg（LBA 20 起） ---')
// 引导镜像大小：麒麟 efiboot.img = 7.7MB → 读 8MB 窗口
const boot = Buffer.alloc(8 * 1024 * 1024)
fs.readSync(fd, boot, 0, boot.length, 20 * 2048)
fs.closeSync(fd)
const fat = new FatImage(boot.subarray(0, fatSizeOf(boot)))
const grub = fat.listAll().find(f => !f.dir && /GRUB\.CFG$/i.test(f.path))
if (!grub || !grub.data) throw new Error('引导镜像内找不到 GRUB.CFG')
console.log('--- 引导镜像内 grub.cfg 全文 ---')
console.log(grub.data.toString('utf8').replace(/\n{2,}/g, '\n'))  // 去掉补丁填充的空行

function fatSizeOf(buf) {
  // 从 BPB 算总扇区
  const tot16 = buf.readUInt16LE(19), tot32 = buf.readUInt32LE(32)
  return (tot16 || tot32) * 512
}
