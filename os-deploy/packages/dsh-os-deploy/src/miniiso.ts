// miniiso.ts — 纯 Node 迷你启动 ISO 构建器（自原 osdeploy 工具移植）
//
// 虚拟光驱安装方案的核心：iBMC 只接受 https:// 镜像 URL 且要把镜像下载到
// BMC 侧才完成"插入"。挂载完整 DVD（17GB+）既超时也可能超出 BMC 能力，
// 因此为每台机器现场构建一个小启动 ISO（EFI 引导 + grub.cfg + kernel +
// initrd + stage2 install.img，约 800MB），安装期软件包再走 HTTP 仓库。
//
//   固件 → El Torito → efiboot.img(FAT) → \EFI\BOOT\BOOTAA64.EFI
//        → grub(grub.cfg) → kernel/initrd(ISO9660) → anaconda → /repo
import * as fs from 'fs'
import * as path from 'path'

const SEC = 2048

// ---------- ISO9660 基础编码 ----------
function b733(n: number): Buffer {
  const b = Buffer.alloc(8)
  b.writeUInt32LE(n >>> 0, 0); b.writeUInt32BE(n >>> 0, 4)
  return b
}
function b723(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt16LE(n & 0xffff, 0); b.writeUInt16BE(n & 0xffff, 2)
  return b
}
function decTime(d = new Date()): Buffer {
  const p = (v: number, w: number) => String(v).padStart(w, '0')
  return Buffer.from(
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}` +
    `${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}00\x00`)
}
function recDate(d = new Date()): Buffer {
  return Buffer.from([d.getUTCFullYear() - 1900, d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), 0])
}
function padEven(b: Buffer): Buffer { return b.length % 2 ? Buffer.concat([b, Buffer.from([0])]) : b }
function padToSector(b: Buffer): Buffer {
  const need = Math.ceil(b.length / SEC) * SEC
  return b.length === need ? b : Buffer.concat([b, Buffer.alloc(need - b.length)])
}

// ---------- SUSP / Rock Ridge 条目 ----------
function nmEntry(name: string): Buffer {
  const n = Buffer.from(name, 'utf8')
  const len = 5 + n.length + ((5 + n.length) % 2)
  const e = Buffer.alloc(len)
  e.write('NM', 0, 'ascii')
  e[2] = len; e[3] = 1; e[4] = 0
  n.copy(e, 5)
  return e
}
function pxEntry(isDir: boolean): Buffer {
  const e = Buffer.alloc(36)
  e.write('PX', 0, 'ascii')
  e[2] = 36; e[3] = 1
  b733(isDir ? 0o040555 : 0o0100444).copy(e, 4)
  b733(1).copy(e, 12)
  b733(0).copy(e, 20)
  b733(0).copy(e, 28)
  return e
}
function spEntry(): Buffer {
  return Buffer.from([0x53, 0x50, 0x07, 0x01, 0xBE, 0xEF, 0x00])
}
function isoId(name: string, isFile: boolean): string {
  let id = name.toUpperCase()
  if (isFile && !/;\d+$/.test(id)) id += ';1'
  return id
}

interface DirRecOpts {
  idBuf: Buffer; idLen?: number; isDir: boolean; lba: number; size: number; su?: Buffer | null
}
function dirRecord(o: DirRecOpts): Buffer {
  const ilen = o.idLen != null ? o.idLen : o.idBuf.length
  let idb = o.idBuf
  if ((33 + ilen) % 2 === 1) idb = Buffer.concat([o.idBuf, Buffer.from([0])])
  const head = Buffer.alloc(33)
  head[1] = 0
  b733(o.lba).copy(head, 2)
  b733(o.size).copy(head, 10)
  recDate().copy(head, 18)
  head[25] = o.isDir ? 0x02 : 0x00
  head[26] = 0
  head[27] = 0
  b723(1).copy(head, 28)
  head[32] = ilen
  const parts: Buffer[] = [head, idb]
  if (o.su && o.su.length) parts.push(o.su)
  let rec = Buffer.concat(parts)
  if (rec.length % 2) rec = Buffer.concat([rec, Buffer.from([0])])
  rec[0] = rec.length
  return rec
}

// ---------- ISO 文件树 ----------
interface IsoFileSpec { path: string; data?: Buffer; src?: string }
interface TreeNode {
  name: string; isDir: boolean; children: Map<string, TreeNode>; parent: TreeNode | null
  data?: Buffer; src?: string; size: number; lba?: number
}

export interface BuildIsoResult {
  label: string; totalSectors: number; size: number
  bootLBA: number; catalogLBA: number
}

/** 构建带 Rock Ridge 名与 El Torito EFI(0xEF) 无模拟引导项的可引导 ISO9660。 */
export async function buildIso(opts: {
  label: string; files: IsoFileSpec[]; bootImage: Buffer; out: string
}): Promise<BuildIsoResult> {
  const label = (opts.label || 'OSDEPLOY').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 32)
  if (!opts.bootImage || !opts.bootImage.length) throw new Error('bootImage required')
  if (!opts.out) throw new Error('out required')

  // ---- 建树 ----
  const root: TreeNode = { name: '', isDir: true, children: new Map(), parent: null, size: 0 }
  for (const f of opts.files || []) {
    const parts = f.path.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) throw new Error(`bad path: ${f.path}`)
    let node = root
    for (const p of parts) {
      let next = node.children.get(p)
      if (!next) {
        next = { name: p, isDir: true, children: new Map(), parent: node, size: 0 }
        node.children.set(p, next)
      }
      node = next
      if (!node.isDir) throw new Error(`conflict: ${p} is a file`)
    }
    const size = f.data ? f.data.length : fs.statSync(f.src!).size
    node.children.set(name, { name, isDir: false, children: new Map(), parent: node, data: f.data, src: f.src, size })
  }
  const childList = (d: TreeNode) =>
    [...d.children.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const dirs: TreeNode[] = []
  ;(function walk(n: TreeNode) {
    for (const c of childList(n)) if (c.isDir) { dirs.push(c); walk(c) }
  })(root)

  // ---- 计算尺寸 ----
  const dirTableSize = (d: TreeNode) => {
    let n = 0
    n += dirRecord({ idBuf: Buffer.from([0]), idLen: 1, isDir: true, lba: 0, size: 0, su: d === root ? Buffer.concat([spEntry(), pxEntry(true)]) : pxEntry(true) }).length
    n += dirRecord({ idBuf: Buffer.from([1]), idLen: 1, isDir: true, lba: 0, size: 0, su: pxEntry(true) }).length
    for (const c of childList(d)) {
      const id = isoId(c.name, !c.isDir)
      n += dirRecord({
        idBuf: Buffer.from(id, 'ascii'), idLen: id.length, isDir: c.isDir, lba: 0,
        size: c.isDir ? 2048 : c.size, su: Buffer.concat([nmEntry(c.name), pxEntry(c.isDir)]),
      }).length
    }
    return n
  }
  const sizes = new Map<TreeNode, number>([[root, dirTableSize(root)]])
  for (const d of dirs) sizes.set(d, dirTableSize(d))

  const ptRec = (d: TreeNode) => {
    const id = d === root ? Buffer.from([0]) : Buffer.from(isoId(d.name, false), 'ascii')
    return 8 + padEven(id).length
  }
  const ptDirs = [root, ...dirs]
  const pathTableSize = ptDirs.reduce((a, d) => a + ptRec(d), 0)

  // ---- 分配扇区 ----
  const catalogLBA = 19
  const bootLBA = 20
  const bootSectors = Math.ceil(opts.bootImage.length / SEC)
  let cursor = bootLBA + bootSectors
  const lPathLBA = cursor; cursor += Math.ceil(pathTableSize / SEC)
  const mPathLBA = cursor; cursor += Math.ceil(pathTableSize / SEC)
  const dirLBA = new Map<TreeNode, number>()
  for (const d of ptDirs) { dirLBA.set(d, cursor); cursor += Math.ceil(sizes.get(d)! / SEC) }
  const filesOrdered: TreeNode[] = []
  ;(function walkF(n: TreeNode) {
    for (const c of childList(n)) { if (c.isDir) walkF(c); else filesOrdered.push(c) }
  })(root)
  for (const f of filesOrdered) { f.lba = cursor; cursor += Math.ceil(f.size / SEC) }
  const totalSectors = cursor

  const dirNum = new Map<TreeNode, number>()
  ptDirs.forEach((d, i) => dirNum.set(d, i + 1))

  // ---- 结构 ----
  const buildPathTable = (be: boolean): Buffer => {
    const parts: Buffer[] = []
    for (const d of ptDirs) {
      const id = d === root ? Buffer.from([0]) : Buffer.from(isoId(d.name, false), 'ascii')
      const rec = Buffer.alloc(8 + padEven(id).length)
      rec[0] = id.length; rec[1] = 0
      if (be) { rec.writeUInt32BE(dirLBA.get(d)!, 2); rec.writeUInt16BE(dirNum.get(d.parent || root)!, 6) }
      else { rec.writeUInt32LE(dirLBA.get(d)!, 2); rec.writeUInt16LE(dirNum.get(d.parent || root)!, 6) }
      padEven(id).copy(rec, 8)
      parts.push(rec)
    }
    return Buffer.concat(parts)
  }
  const buildDirTable = (d: TreeNode): Buffer => {
    const parts: Buffer[] = []
    const selfLba = dirLBA.get(d)!
    const parentLba = d.parent ? dirLBA.get(d.parent)! : selfLba
    const parentSize = d.parent ? sizes.get(d.parent)! : sizes.get(d)!
    parts.push(dirRecord({ idBuf: Buffer.from([0]), idLen: 1, isDir: true, lba: selfLba, size: sizes.get(d)!, su: d === root ? Buffer.concat([spEntry(), pxEntry(true)]) : pxEntry(true) }))
    parts.push(dirRecord({ idBuf: Buffer.from([1]), idLen: 1, isDir: true, lba: parentLba, size: parentSize, su: pxEntry(true) }))
    for (const c of childList(d)) {
      const id = isoId(c.name, !c.isDir)
      const lba = c.isDir ? dirLBA.get(c)! : c.lba!
      const csize = c.isDir ? sizes.get(c)! : c.size
      parts.push(dirRecord({ idBuf: Buffer.from(id, 'ascii'), idLen: id.length, isDir: c.isDir, lba, size: csize, su: Buffer.concat([nmEntry(c.name), pxEntry(c.isDir)]) }))
    }
    return padToSector(Buffer.concat(parts))
  }
  const buildPVD = () => {
    const b = Buffer.alloc(SEC)
    b[0] = 1; b.write('CD001', 1, 5, 'ascii'); b[6] = 1
    b.write(' '.repeat(32), 8, 32, 'ascii')
    b.write((label + ' '.repeat(32)).slice(0, 32), 40, 32, 'ascii')
    b733(totalSectors).copy(b, 80)
    b723(1).copy(b, 120)
    b723(1).copy(b, 124)
    b723(SEC).copy(b, 128)
    b733(pathTableSize).copy(b, 132)
    b.writeUInt32LE(lPathLBA, 140)
    b.writeUInt32LE(0, 144)
    b.writeUInt32BE(mPathLBA, 148)
    b.writeUInt32LE(0, 152)
    dirRecord({ idBuf: Buffer.from([0]), isDir: true, lba: dirLBA.get(root)!, size: sizes.get(root)!, su: null }).copy(b, 156)
    b.write('OSDEPLOY'.padEnd(128, ' '), 190, 128, 'ascii')
    b.write('OSDEPLOY'.padEnd(128, ' '), 318, 128, 'ascii')
    b.write('OSDEPLOY AUTOMATED INSTALLER'.padEnd(128, ' '), 446, 128, 'ascii')
    b.write('OSDEPLOY'.padEnd(128, ' '), 574, 128, 'ascii')
    decTime().copy(b, 813)
    decTime().copy(b, 830)
    b[881] = 1
    return b
  }
  const buildBootRecord = () => {
    const b = Buffer.alloc(SEC)
    b[0] = 0; b.write('CD001', 1, 5, 'ascii'); b[6] = 1
    b.write('EL TORITO SPECIFICATION', 7, 'ascii')
    b.writeUInt32LE(catalogLBA, 71)
    return b
  }
  const buildTerminator = () => {
    const b = Buffer.alloc(SEC)
    b[0] = 255; b.write('CD001', 1, 5, 'ascii'); b[6] = 1
    return b
  }
  const buildCatalog = () => {
    const cat = Buffer.alloc(SEC)
    // 校验条目
    cat[0] = 0x01; cat[1] = 0xEF
    cat.write('OSDEPLOY', 4, 'ascii')
    cat[30] = 0x55; cat[31] = 0xAA
    let sum = 0
    for (let i = 0; i < 16; i++) if (i !== 14) sum = (sum + cat.readUInt16LE(i * 2)) & 0xffff
    cat.writeUInt16LE((0x10000 - sum) & 0xffff, 28)
    // 初始/默认引导条目（无模拟 EFI 引导，镜像原版固件已验证的布局）
    cat[32] = 0x88; cat[33] = 0x00
    cat.writeUInt16LE(0, 34)
    cat[36] = 0; cat[37] = 0
    cat.writeUInt16LE(Math.ceil(opts.bootImage.length / 512), 38)
    cat.writeUInt32LE(bootLBA, 40)
    return cat
  }

  // ---- 写盘（大文件流式） ----
  const ws = fs.createWriteStream(opts.out)
  const write = (buf: Buffer) => new Promise<void>((res, rej) => ws.write(buf, e => (e ? rej(e) : res())))
  try {
    await write(Buffer.alloc(16 * SEC))
    await write(buildPVD())
    await write(buildBootRecord())
    await write(buildTerminator())
    await write(buildCatalog())
    await write(padToSector(opts.bootImage))
    await write(padToSector(buildPathTable(false)))
    await write(padToSector(buildPathTable(true)))
    for (const d of ptDirs) await write(buildDirTable(d))
    for (const f of filesOrdered) {
      if (f.data) { await write(padToSector(f.data)); continue }
      const fd = fs.openSync(f.src!, 'r')
      const chunk = Buffer.alloc(8 * 1024 * 1024)
      let left = f.size
      while (left > 0) {
        const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, left), null)
        if (n <= 0) break
        await write(n === chunk.length ? chunk : chunk.slice(0, n))
        left -= n
      }
      fs.closeSync(fd)
      const rem = Math.ceil(f.size / SEC) * SEC - f.size
      if (rem > 0) await write(Buffer.alloc(rem))
    }
    await new Promise<void>((res, rej) => ws.end((e: Error | null | undefined) => (e ? rej(e) : res())))
  } catch (e) {
    try { ws.destroy() } catch { /* ignore */ }
    throw e
  }
  return { label, totalSectors, size: totalSectors * SEC, bootLBA, catalogLBA }
}

// ---------- FAT12/16 镜像读取 ----------
export class FatImage {
  buf: Buffer
  bps: number; spc: number; rsvd: number; nfats: number; rootEntries: number
  totSec16: number; fatSz16: number; totSec32: number; totalSectors: number
  fatStart: number; rootStart: number; rootSectors: number; dataStart: number
  clusterCount: number; fatType: number

  constructor(buf: Buffer) {
    this.buf = buf
    const b = buf
    if (b.length < 512) throw new Error('FAT: image too small')
    if (b[510] !== 0x55 || b[511] !== 0xaa) throw new Error('FAT: no boot signature')
    this.bps = b.readUInt16LE(11)
    this.spc = b[13]
    this.rsvd = b.readUInt16LE(14)
    this.nfats = b[16]
    this.rootEntries = b.readUInt16LE(17)
    this.totSec16 = b.readUInt16LE(19)
    this.fatSz16 = b.readUInt16LE(22)
    this.totSec32 = b.readUInt32LE(32)
    this.totalSectors = this.totSec16 || this.totSec32
    this.fatStart = this.rsvd
    this.rootStart = this.rsvd + this.nfats * this.fatSz16
    this.rootSectors = Math.ceil((this.rootEntries * 32) / this.bps)
    this.dataStart = this.rootStart + this.rootSectors
    this.clusterCount = Math.floor((this.totalSectors - this.dataStart) / this.spc)
    this.fatType = this.clusterCount >= 4085 ? 16 : 12
  }
  clusterOffset(n: number) { return (this.dataStart + (n - 2) * this.spc) * this.bps }
  nextCluster(n: number): number {
    if (this.fatType === 16) {
      const v = this.buf.readUInt16LE(this.fatStart * this.bps + n * 2)
      return v >= 0xfff8 ? 0 : v
    }
    const off = this.fatStart * this.bps + Math.floor(n * 1.5)
    const v = this.buf.readUInt16LE(off)
    const e = n & 1 ? v >> 4 : v & 0xfff
    return e >= 0xff8 ? 0 : e
  }
  readChain(first: number, size: number): Buffer {
    const out = Buffer.alloc(size)
    let c = first, pos = 0
    while (c >= 2 && pos < size) {
      const off = this.clusterOffset(c)
      const take = Math.min(this.spc * this.bps, size - pos)
      this.buf.copy(out, pos, off, off + take)
      pos += take
      c = this.nextCluster(c)
    }
    return out
  }
  readDir(cluster: number) {
    let buf: Buffer
    if (cluster === 0) {
      buf = this.buf.slice(this.rootStart * this.bps, this.rootStart * this.bps + this.rootEntries * 32)
    } else {
      const chunks: Buffer[] = []
      let c = cluster
      while (c >= 2) {
        chunks.push(Buffer.from(this.buf.slice(this.clusterOffset(c), this.clusterOffset(c) + this.spc * this.bps)))
        c = this.nextCluster(c)
      }
      buf = Buffer.concat(chunks)
    }
    const entries: { short: string; attr: number; isDir: boolean; firstClus: number; size: number }[] = []
    for (let off = 0; off + 32 <= buf.length; off += 32) {
      const e = buf.slice(off, off + 32)
      if (e[0] === 0x00) break
      if (e[0] === 0xe5) continue
      const attr = e[11]!
      if ((attr & 0x3f) === 0x0f) continue // LFN
      if (attr & 0x08) continue            // 卷标
      const name = e.slice(0, 11).toString('ascii')
      const base = name.slice(0, 8).replace(/ +$/, '')
      const ext = name.slice(8).replace(/ +$/, '')
      entries.push({
        short: ext ? base + '.' + ext : base,
        attr, isDir: !!(attr & 0x10),
        firstClus: e.readUInt16LE(26),
        size: e.readUInt32LE(28),
      })
    }
    return entries
  }
  listAll() {
    const files: { path: string; dir: boolean; firstClus?: number; data?: Buffer; size?: number }[] = []
    const walk = (dirCluster: number, prefix: string) => {
      for (const e of this.readDir(dirCluster)) {
        if (e.short === '.' || e.short === '..') continue
        const p = prefix + e.short
        if (e.isDir) { files.push({ path: p + '/', dir: true }); walk(e.firstClus, p + '/') }
        else files.push({ path: p, dir: false, firstClus: e.firstClus, data: this.readChain(e.firstClus, e.size), size: e.size })
      }
    }
    walk(0, '/')
    return files
  }
}

/** 就地覆写 FAT 镜像内的一个文件（保持簇链/目录项不变，新内容不得大于原文件）。 */
export function patchFatFile(buf: Buffer, pathUpper: string, newData: Buffer): Buffer {
  const fat = new FatImage(buf)
  const files = fat.listAll()
  const f = files.find(x => !x.dir && x.path.toUpperCase() === String(pathUpper).toUpperCase())
  if (!f || f.firstClus === undefined || f.size === undefined) throw new Error(`patchFatFile: not found in FAT image: ${pathUpper}`)
  if (newData.length > f.size) throw new Error(`patchFatFile: new content (${newData.length}B) exceeds original file size (${f.size}B)`)
  const padded = Buffer.alloc(f.size, 0x0a)
  newData.copy(padded, 0)
  const clusterSize = fat.spc * fat.bps
  let c = f.firstClus, pos = 0
  while (c >= 2 && pos < f.size) {
    const off = fat.clusterOffset(c)
    const take = Math.min(clusterSize, f.size - pos)
    padded.copy(buf, off, pos, pos + take)
    pos += take
    c = fat.nextCluster(c)
  }
  if (pos < f.size) throw new Error('patchFatFile: cluster chain shorter than file size')
  return buf
}

// ---------- 迷你 ISO 组装 ----------
export interface MiniIsoOpts {
  repoDir: string
  label: string
  ks: string
  grubCfg: string
  grubCfgPath?: string
  out: string
  slim?: boolean
}

/** 组装每机迷你启动 ISO：原厂 efiboot.img 内 grub.cfg 就地替换 + kernel/initrd/ks。 */
export async function buildMiniIso(o: MiniIsoOpts): Promise<{ size: number; bootImageSize: number }> {
  const grubCfgPath = o.grubCfgPath || '/EFI/BOOT/GRUB.CFG'
  const efiBootSrc = path.join(o.repoDir, 'images', 'efiboot.img')
  const orig = fs.readFileSync(efiBootSrc)
  const grubBuf = Buffer.from(o.grubCfg, 'utf8')
  const bootImage = patchFatFile(orig, grubCfgPath, grubBuf)

  const isoFiles: IsoFileSpec[] = [
    { path: '/ks.cfg', data: Buffer.from(o.ks, 'utf8') },
    { path: '/.disk/info', data: Buffer.from(`osdeploy mini disc for ${o.label}\n`, 'utf8') },
    { path: '/EFI/BOOT/grub.cfg', data: grubBuf },
    { path: '/images/pxeboot/vmlinuz', src: path.join(o.repoDir, 'images', 'pxeboot', 'vmlinuz') },
    { path: '/images/pxeboot/initrd.img', src: path.join(o.repoDir, 'images', 'pxeboot', 'initrd.img') },
  ]
  if (!o.slim) {
    isoFiles.push({ path: '/images/install.img', src: path.join(o.repoDir, 'images', 'install.img') })
  }
  for (const f of isoFiles) if (f.src && !fs.existsSync(f.src)) throw new Error(`missing repo asset: ${f.src}`)

  const info = await buildIso({ label: o.label, files: isoFiles, bootImage, out: o.out })
  return { size: info.size, bootImageSize: bootImage.length }
}

/** Debian HTTP 引导迷你 ISO（~4MB）：仅 grub(grub.cfg)，kernel/initrd 由 grub 经 HTTP 拉取。 */
export async function buildDebianHttpIso(o: {
  repoDir: string; label: string; grubCfg: string; out: string
  grubBootImage?: Buffer
}): Promise<{ size: number }> {
  const bootImage = o.grubBootImage
    ? patchFatFile(o.grubBootImage, '/EFI/BOOT/GRUB.CFG', Buffer.from(o.grubCfg, 'utf8'))
    : fs.readFileSync(path.join(o.repoDir, 'images', 'efiboot.img')) // 退化：debian 自带 efiboot
  const files: IsoFileSpec[] = [
    { path: '/.disk/info', data: Buffer.from(`osdeploy mini disc for ${o.label}\n`, 'utf8') },
    { path: '/EFI/BOOT/grub.cfg', data: Buffer.from(o.grubCfg, 'utf8') },
  ]
  const info = await buildIso({ label: o.label, files, bootImage, out: o.out })
  return { size: info.size }
}
