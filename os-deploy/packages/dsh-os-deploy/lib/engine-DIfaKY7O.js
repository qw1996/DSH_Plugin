import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as dgram from "dgram";
import { execFileSync } from "child_process";
//#region src/miniiso.ts
const SEC = 2048;
function b733(n) {
	const b = Buffer.alloc(8);
	b.writeUInt32LE(n >>> 0, 0);
	b.writeUInt32BE(n >>> 0, 4);
	return b;
}
function b723(n) {
	const b = Buffer.alloc(4);
	b.writeUInt16LE(n & 65535, 0);
	b.writeUInt16BE(n & 65535, 2);
	return b;
}
function decTime(d = /* @__PURE__ */ new Date()) {
	const p = (v, w) => String(v).padStart(w, "0");
	return Buffer.from(`${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}00\x00`);
}
function recDate(d = /* @__PURE__ */ new Date()) {
	return Buffer.from([
		d.getUTCFullYear() - 1900,
		d.getUTCMonth() + 1,
		d.getUTCDate(),
		d.getUTCHours(),
		d.getUTCMinutes(),
		d.getUTCSeconds(),
		0
	]);
}
function padEven(b) {
	return b.length % 2 ? Buffer.concat([b, Buffer.from([0])]) : b;
}
function padToSector(b) {
	const need = Math.ceil(b.length / SEC) * SEC;
	return b.length === need ? b : Buffer.concat([b, Buffer.alloc(need - b.length)]);
}
function nmEntry(name) {
	const n = Buffer.from(name, "utf8");
	const len = 5 + n.length + (5 + n.length) % 2;
	const e = Buffer.alloc(len);
	e.write("NM", 0, "ascii");
	e[2] = len;
	e[3] = 1;
	e[4] = 0;
	n.copy(e, 5);
	return e;
}
function pxEntry(isDir) {
	const e = Buffer.alloc(36);
	e.write("PX", 0, "ascii");
	e[2] = 36;
	e[3] = 1;
	b733(isDir ? 16749 : 33060).copy(e, 4);
	b733(1).copy(e, 12);
	b733(0).copy(e, 20);
	b733(0).copy(e, 28);
	return e;
}
function spEntry() {
	return Buffer.from([
		83,
		80,
		7,
		1,
		190,
		239,
		0
	]);
}
function isoId(name, isFile) {
	let id = name.toUpperCase();
	if (isFile && !/;\d+$/.test(id)) id += ";1";
	return id;
}
function dirRecord(o) {
	const ilen = o.idLen != null ? o.idLen : o.idBuf.length;
	let idb = o.idBuf;
	if ((33 + ilen) % 2 === 1) idb = Buffer.concat([o.idBuf, Buffer.from([0])]);
	const head = Buffer.alloc(33);
	head[1] = 0;
	b733(o.lba).copy(head, 2);
	b733(o.size).copy(head, 10);
	recDate().copy(head, 18);
	head[25] = o.isDir ? 2 : 0;
	head[26] = 0;
	head[27] = 0;
	b723(1).copy(head, 28);
	head[32] = ilen;
	const parts = [head, idb];
	if (o.su && o.su.length) parts.push(o.su);
	let rec = Buffer.concat(parts);
	if (rec.length % 2) rec = Buffer.concat([rec, Buffer.from([0])]);
	rec[0] = rec.length;
	return rec;
}
/** 构建带 Rock Ridge 名与 El Torito EFI(0xEF) 无模拟引导项的可引导 ISO9660。 */
async function buildIso(opts) {
	const label = (opts.label || "OSDEPLOY").toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32);
	if (!opts.bootImage || !opts.bootImage.length) throw new Error("bootImage required");
	if (!opts.out) throw new Error("out required");
	const root = {
		name: "",
		isDir: true,
		children: /* @__PURE__ */ new Map(),
		parent: null,
		size: 0
	};
	for (const f of opts.files || []) {
		const parts = f.path.split("/").filter(Boolean);
		const name = parts.pop();
		if (!name) throw new Error(`bad path: ${f.path}`);
		let node = root;
		for (const p of parts) {
			let next = node.children.get(p);
			if (!next) {
				next = {
					name: p,
					isDir: true,
					children: /* @__PURE__ */ new Map(),
					parent: node,
					size: 0
				};
				node.children.set(p, next);
			}
			node = next;
			if (!node.isDir) throw new Error(`conflict: ${p} is a file`);
		}
		const size = f.data ? f.data.length : fs.statSync(f.src).size;
		node.children.set(name, {
			name,
			isDir: false,
			children: /* @__PURE__ */ new Map(),
			parent: node,
			data: f.data,
			src: f.src,
			size
		});
	}
	const childList = (d) => [...d.children.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const dirs = [];
	(function walk(n) {
		for (const c of childList(n)) if (c.isDir) {
			dirs.push(c);
			walk(c);
		}
	})(root);
	const dirTableSize = (d) => {
		let n = 0;
		n += dirRecord({
			idBuf: Buffer.from([0]),
			idLen: 1,
			isDir: true,
			lba: 0,
			size: 0,
			su: d === root ? Buffer.concat([spEntry(), pxEntry(true)]) : pxEntry(true)
		}).length;
		n += dirRecord({
			idBuf: Buffer.from([1]),
			idLen: 1,
			isDir: true,
			lba: 0,
			size: 0,
			su: pxEntry(true)
		}).length;
		for (const c of childList(d)) {
			const id = isoId(c.name, !c.isDir);
			n += dirRecord({
				idBuf: Buffer.from(id, "ascii"),
				idLen: id.length,
				isDir: c.isDir,
				lba: 0,
				size: c.isDir ? 2048 : c.size,
				su: Buffer.concat([nmEntry(c.name), pxEntry(c.isDir)])
			}).length;
		}
		return n;
	};
	const sizes = /* @__PURE__ */ new Map([[root, dirTableSize(root)]]);
	for (const d of dirs) sizes.set(d, dirTableSize(d));
	const ptRec = (d) => {
		return 8 + padEven(d === root ? Buffer.from([0]) : Buffer.from(isoId(d.name, false), "ascii")).length;
	};
	const ptDirs = [root, ...dirs];
	const pathTableSize = ptDirs.reduce((a, d) => a + ptRec(d), 0);
	const catalogLBA = 19;
	const bootLBA = 20;
	let cursor = bootLBA + Math.ceil(opts.bootImage.length / SEC);
	const lPathLBA = cursor;
	cursor += Math.ceil(pathTableSize / SEC);
	const mPathLBA = cursor;
	cursor += Math.ceil(pathTableSize / SEC);
	const dirLBA = /* @__PURE__ */ new Map();
	for (const d of ptDirs) {
		dirLBA.set(d, cursor);
		cursor += Math.ceil(sizes.get(d) / SEC);
	}
	const filesOrdered = [];
	(function walkF(n) {
		for (const c of childList(n)) if (c.isDir) walkF(c);
		else filesOrdered.push(c);
	})(root);
	for (const f of filesOrdered) {
		f.lba = cursor;
		cursor += Math.ceil(f.size / SEC);
	}
	const totalSectors = cursor;
	const dirNum = /* @__PURE__ */ new Map();
	ptDirs.forEach((d, i) => dirNum.set(d, i + 1));
	const buildPathTable = (be) => {
		const parts = [];
		for (const d of ptDirs) {
			const id = d === root ? Buffer.from([0]) : Buffer.from(isoId(d.name, false), "ascii");
			const rec = Buffer.alloc(8 + padEven(id).length);
			rec[0] = id.length;
			rec[1] = 0;
			if (be) {
				rec.writeUInt32BE(dirLBA.get(d), 2);
				rec.writeUInt16BE(dirNum.get(d.parent || root), 6);
			} else {
				rec.writeUInt32LE(dirLBA.get(d), 2);
				rec.writeUInt16LE(dirNum.get(d.parent || root), 6);
			}
			padEven(id).copy(rec, 8);
			parts.push(rec);
		}
		return Buffer.concat(parts);
	};
	const buildDirTable = (d) => {
		const parts = [];
		const selfLba = dirLBA.get(d);
		const parentLba = d.parent ? dirLBA.get(d.parent) : selfLba;
		const parentSize = d.parent ? sizes.get(d.parent) : sizes.get(d);
		parts.push(dirRecord({
			idBuf: Buffer.from([0]),
			idLen: 1,
			isDir: true,
			lba: selfLba,
			size: sizes.get(d),
			su: d === root ? Buffer.concat([spEntry(), pxEntry(true)]) : pxEntry(true)
		}));
		parts.push(dirRecord({
			idBuf: Buffer.from([1]),
			idLen: 1,
			isDir: true,
			lba: parentLba,
			size: parentSize,
			su: pxEntry(true)
		}));
		for (const c of childList(d)) {
			const id = isoId(c.name, !c.isDir);
			const lba = c.isDir ? dirLBA.get(c) : c.lba;
			const csize = c.isDir ? sizes.get(c) : c.size;
			parts.push(dirRecord({
				idBuf: Buffer.from(id, "ascii"),
				idLen: id.length,
				isDir: c.isDir,
				lba,
				size: csize,
				su: Buffer.concat([nmEntry(c.name), pxEntry(c.isDir)])
			}));
		}
		return padToSector(Buffer.concat(parts));
	};
	const buildPVD = () => {
		const b = Buffer.alloc(SEC);
		b[0] = 1;
		b.write("CD001", 1, 5, "ascii");
		b[6] = 1;
		b.write(" ".repeat(32), 8, 32, "ascii");
		b.write((label + " ".repeat(32)).slice(0, 32), 40, 32, "ascii");
		b733(totalSectors).copy(b, 80);
		b723(1).copy(b, 120);
		b723(1).copy(b, 124);
		b723(SEC).copy(b, 128);
		b733(pathTableSize).copy(b, 132);
		b.writeUInt32LE(lPathLBA, 140);
		b.writeUInt32LE(0, 144);
		b.writeUInt32BE(mPathLBA, 148);
		b.writeUInt32LE(0, 152);
		dirRecord({
			idBuf: Buffer.from([0]),
			isDir: true,
			lba: dirLBA.get(root),
			size: sizes.get(root),
			su: null
		}).copy(b, 156);
		b.write("OSDEPLOY".padEnd(128, " "), 190, 128, "ascii");
		b.write("OSDEPLOY".padEnd(128, " "), 318, 128, "ascii");
		b.write("OSDEPLOY AUTOMATED INSTALLER".padEnd(128, " "), 446, 128, "ascii");
		b.write("OSDEPLOY".padEnd(128, " "), 574, 128, "ascii");
		decTime().copy(b, 813);
		decTime().copy(b, 830);
		b[881] = 1;
		return b;
	};
	const buildBootRecord = () => {
		const b = Buffer.alloc(SEC);
		b[0] = 0;
		b.write("CD001", 1, 5, "ascii");
		b[6] = 1;
		b.write("EL TORITO SPECIFICATION", 7, "ascii");
		b.writeUInt32LE(catalogLBA, 71);
		return b;
	};
	const buildTerminator = () => {
		const b = Buffer.alloc(SEC);
		b[0] = 255;
		b.write("CD001", 1, 5, "ascii");
		b[6] = 1;
		return b;
	};
	const buildCatalog = () => {
		const cat = Buffer.alloc(SEC);
		cat[0] = 1;
		cat[1] = 239;
		cat.write("OSDEPLOY", 4, "ascii");
		cat[30] = 85;
		cat[31] = 170;
		let sum = 0;
		for (let i = 0; i < 16; i++) if (i !== 14) sum = sum + cat.readUInt16LE(i * 2) & 65535;
		cat.writeUInt16LE(65536 - sum & 65535, 28);
		cat[32] = 136;
		cat[33] = 0;
		cat.writeUInt16LE(0, 34);
		cat[36] = 0;
		cat[37] = 0;
		cat.writeUInt16LE(Math.ceil(opts.bootImage.length / 512), 38);
		cat.writeUInt32LE(bootLBA, 40);
		return cat;
	};
	const ws = fs.createWriteStream(opts.out);
	const write = (buf) => new Promise((res, rej) => ws.write(buf, (e) => e ? rej(e) : res()));
	try {
		await write(Buffer.alloc(16 * SEC));
		await write(buildPVD());
		await write(buildBootRecord());
		await write(buildTerminator());
		await write(buildCatalog());
		await write(padToSector(opts.bootImage));
		await write(padToSector(buildPathTable(false)));
		await write(padToSector(buildPathTable(true)));
		for (const d of ptDirs) await write(buildDirTable(d));
		for (const f of filesOrdered) {
			if (f.data) {
				await write(padToSector(f.data));
				continue;
			}
			const fd = fs.openSync(f.src, "r");
			const chunk = Buffer.alloc(8388608);
			let left = f.size;
			while (left > 0) {
				const n = fs.readSync(fd, chunk, 0, Math.min(chunk.length, left), null);
				if (n <= 0) break;
				await write(n === chunk.length ? chunk : chunk.slice(0, n));
				left -= n;
			}
			fs.closeSync(fd);
			const rem = Math.ceil(f.size / SEC) * SEC - f.size;
			if (rem > 0) await write(Buffer.alloc(rem));
		}
		await new Promise((res, rej) => ws.end((e) => e ? rej(e) : res()));
	} catch (e) {
		try {
			ws.destroy();
		} catch {}
		throw e;
	}
	return {
		label,
		totalSectors,
		size: totalSectors * SEC,
		bootLBA,
		catalogLBA
	};
}
var FatImage = class {
	buf;
	bps;
	spc;
	rsvd;
	nfats;
	rootEntries;
	totSec16;
	fatSz16;
	totSec32;
	totalSectors;
	fatStart;
	rootStart;
	rootSectors;
	dataStart;
	clusterCount;
	fatType;
	constructor(buf) {
		this.buf = buf;
		const b = buf;
		if (b.length < 512) throw new Error("FAT: image too small");
		if (b[510] !== 85 || b[511] !== 170) throw new Error("FAT: no boot signature");
		this.bps = b.readUInt16LE(11);
		this.spc = b[13];
		this.rsvd = b.readUInt16LE(14);
		this.nfats = b[16];
		this.rootEntries = b.readUInt16LE(17);
		this.totSec16 = b.readUInt16LE(19);
		this.fatSz16 = b.readUInt16LE(22);
		this.totSec32 = b.readUInt32LE(32);
		this.totalSectors = this.totSec16 || this.totSec32;
		this.fatStart = this.rsvd;
		this.rootStart = this.rsvd + this.nfats * this.fatSz16;
		this.rootSectors = Math.ceil(this.rootEntries * 32 / this.bps);
		this.dataStart = this.rootStart + this.rootSectors;
		this.clusterCount = Math.floor((this.totalSectors - this.dataStart) / this.spc);
		this.fatType = this.clusterCount >= 4085 ? 16 : 12;
	}
	clusterOffset(n) {
		return (this.dataStart + (n - 2) * this.spc) * this.bps;
	}
	nextCluster(n) {
		if (this.fatType === 16) {
			const v = this.buf.readUInt16LE(this.fatStart * this.bps + n * 2);
			return v >= 65528 ? 0 : v;
		}
		const off = this.fatStart * this.bps + Math.floor(n * 1.5);
		const v = this.buf.readUInt16LE(off);
		const e = n & 1 ? v >> 4 : v & 4095;
		return e >= 4088 ? 0 : e;
	}
	readChain(first, size) {
		const out = Buffer.alloc(size);
		let c = first, pos = 0;
		while (c >= 2 && pos < size) {
			const off = this.clusterOffset(c);
			const take = Math.min(this.spc * this.bps, size - pos);
			this.buf.copy(out, pos, off, off + take);
			pos += take;
			c = this.nextCluster(c);
		}
		return out;
	}
	readDir(cluster) {
		let buf;
		if (cluster === 0) buf = this.buf.slice(this.rootStart * this.bps, this.rootStart * this.bps + this.rootEntries * 32);
		else {
			const chunks = [];
			let c = cluster;
			while (c >= 2) {
				chunks.push(Buffer.from(this.buf.slice(this.clusterOffset(c), this.clusterOffset(c) + this.spc * this.bps)));
				c = this.nextCluster(c);
			}
			buf = Buffer.concat(chunks);
		}
		const entries = [];
		for (let off = 0; off + 32 <= buf.length; off += 32) {
			const e = buf.slice(off, off + 32);
			if (e[0] === 0) break;
			if (e[0] === 229) continue;
			const attr = e[11];
			if ((attr & 63) === 15) continue;
			if (attr & 8) continue;
			const name = e.slice(0, 11).toString("ascii");
			const base = name.slice(0, 8).replace(/ +$/, "");
			const ext = name.slice(8).replace(/ +$/, "");
			entries.push({
				short: ext ? base + "." + ext : base,
				attr,
				isDir: !!(attr & 16),
				firstClus: e.readUInt16LE(26),
				size: e.readUInt32LE(28)
			});
		}
		return entries;
	}
	listAll() {
		const files = [];
		const walk = (dirCluster, prefix) => {
			for (const e of this.readDir(dirCluster)) {
				if (e.short === "." || e.short === "..") continue;
				const p = prefix + e.short;
				if (e.isDir) {
					files.push({
						path: p + "/",
						dir: true
					});
					walk(e.firstClus, p + "/");
				} else files.push({
					path: p,
					dir: false,
					firstClus: e.firstClus,
					data: this.readChain(e.firstClus, e.size),
					size: e.size
				});
			}
		};
		walk(0, "/");
		return files;
	}
};
/** 就地覆写 FAT 镜像内的一个文件（保持簇链/目录项不变，新内容不得大于原文件）。 */
function patchFatFile(buf, pathUpper, newData) {
	const fat = new FatImage(buf);
	const f = fat.listAll().find((x) => !x.dir && x.path.toUpperCase() === String(pathUpper).toUpperCase());
	if (!f || f.firstClus === void 0 || f.size === void 0) throw new Error(`patchFatFile: not found in FAT image: ${pathUpper}`);
	if (newData.length > f.size) throw new Error(`patchFatFile: new content (${newData.length}B) exceeds original file size (${f.size}B)`);
	const padded = Buffer.alloc(f.size, 10);
	newData.copy(padded, 0);
	const clusterSize = fat.spc * fat.bps;
	let c = f.firstClus, pos = 0;
	while (c >= 2 && pos < f.size) {
		const off = fat.clusterOffset(c);
		const take = Math.min(clusterSize, f.size - pos);
		padded.copy(buf, off, pos, pos + take);
		pos += take;
		c = fat.nextCluster(c);
	}
	if (pos < f.size) throw new Error("patchFatFile: cluster chain shorter than file size");
	return buf;
}
/** 组装每机迷你启动 ISO：原厂 efiboot.img 内 grub.cfg 就地替换 + kernel/initrd/ks。 */
async function buildMiniIso(o) {
	const grubCfgPath = o.grubCfgPath || "/EFI/BOOT/GRUB.CFG";
	const efiBootSrc = path.join(o.repoDir, "images", "efiboot.img");
	const orig = fs.readFileSync(efiBootSrc);
	const grubBuf = Buffer.from(o.grubCfg, "utf8");
	const bootImage = patchFatFile(orig, grubCfgPath, grubBuf);
	const isoFiles = [
		{
			path: "/ks.cfg",
			data: Buffer.from(o.ks, "utf8")
		},
		{
			path: "/.disk/info",
			data: Buffer.from(`osdeploy mini disc for ${o.label}\n`, "utf8")
		},
		{
			path: "/EFI/BOOT/grub.cfg",
			data: grubBuf
		},
		{
			path: "/images/pxeboot/vmlinuz",
			src: path.join(o.repoDir, "images", "pxeboot", "vmlinuz")
		},
		{
			path: "/images/pxeboot/initrd.img",
			src: path.join(o.repoDir, "images", "pxeboot", "initrd.img")
		}
	];
	if (!o.slim) isoFiles.push({
		path: "/images/install.img",
		src: path.join(o.repoDir, "images", "install.img")
	});
	for (const f of isoFiles) if (f.src && !fs.existsSync(f.src)) throw new Error(`missing repo asset: ${f.src}`);
	return {
		size: (await buildIso({
			label: o.label,
			files: isoFiles,
			bootImage,
			out: o.out
		})).size,
		bootImageSize: bootImage.length
	};
}
/** Debian HTTP 引导迷你 ISO（~4MB）：仅 grub(grub.cfg)，kernel/initrd 由 grub 经 HTTP 拉取。 */
async function buildDebianHttpIso(o) {
	const bootImage = o.grubBootImage ? patchFatFile(o.grubBootImage, "/EFI/BOOT/GRUB.CFG", Buffer.from(o.grubCfg, "utf8")) : fs.readFileSync(path.join(o.repoDir, "images", "efiboot.img"));
	const files = [{
		path: "/.disk/info",
		data: Buffer.from(`osdeploy mini disc for ${o.label}\n`, "utf8")
	}, {
		path: "/EFI/BOOT/grub.cfg",
		data: Buffer.from(o.grubCfg, "utf8")
	}];
	return { size: (await buildIso({
		label: o.label,
		files,
		bootImage,
		out: o.out
	})).size };
}
//#endregion
//#region src/certs.ts
const DEFAULT_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDMzCCAhugAwIBAgIUPI2wSOXPiZA31mvAZXAvgn728WowDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIb3NkZXBsb3kwHhcNMjYwOTE3MDM1NzMwWhcNMzYwOTE0
MDM1NzMwWjATMREwDwYDVQQDDAhvc2RlcGxveTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALUCENvXntt5mMIZ4g7BpDCOQo4fhGi+lHQJbEukp1L2mWVr
9XoY3cyxF+GuPRAEKQKYgYRu/82HJrw+d27I7cjesamsShPBTq6K2bB9QhTK9eOd
eNsHQlPda2UTyi7PcP0hq+wH17Rhk5Mmb3W0MmPGYTH2L3SSf8yLeJMqvc+FWwIb
QVlojUpPIV6xWAf4HkwKNaymoOic/z+ecjeG1aboncISvK+AJWrK5anmSE15IIqd
NIbxk5stIFQxv8rdFg165in19Zzby5v/onbguaW7jzYqjx76sXkN5TqlMZSdgDns
AzuGYwJlXaYfDHBQvE3VKmACxNzE4i3zNSf5GbcCAwEAAaN/MH0wHQYDVR0OBBYE
FHmhdGtFnvfm0wXezJcfvLdsBx+8MB8GA1UdIwQYMBaAFHmhdGtFnvfm0wXezJcf
vLdsBx+8MA8GA1UdEwEB/wQFMAMBAf8wKgYDVR0RBCMwIYcEwKgCiYIIb3NkZXBs
b3mCCWxvY2FsaG9zdIcEfwAAATANBgkqhkiG9w0BAQsFAAOCAQEAF+sx6xbSJkXe
XfBkfWXdR6KdnBHJXq+EKOWl1pV0rS3MPlhwI3e9i/WYSEC0oiWjI1ZMHQ+44EL6
u+k64ICtdnlRtde/L5riamxVliW8OKeLlTFWzhmI04lLw17rw4SBQP4wMJSyolAE
IRD1P8X/lKQA8n6zSY/W/lgjnVnZoHxa2I7iYimB6+UgJORyHDvFCpL1RcPxfoSO
YgFxf5cZBE6GE5bcytaTqtT0NoIUpA32EDUMgGb/xYPlZYxabWhT5zy2u8XF/JbC
DoC2RTlSu/L54EdBiB6EqpIKoAe9NzsIKAubn1O6sKnQNDlNI5Ch8Rdlz9J79vqN
zc2vju5ieA==
-----END CERTIFICATE-----
`;
const DEFAULT_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC1AhDb157beZjC
GeIOwaQwjkKOH4RovpR0CWxLpKdS9plla/V6GN3MsRfhrj0QBCkCmIGEbv/Nhya8
PnduyO3I3rGprEoTwU6uitmwfUIUyvXjnXjbB0JT3WtlE8ouz3D9IavsB9e0YZOT
Jm91tDJjxmEx9i90kn/Mi3iTKr3PhVsCG0FZaI1KTyFesVgH+B5MCjWspqDonP8/
nnI3htWm6J3CEryvgCVqyuWp5khNeSCKnTSG8ZObLSBUMb/K3RYNeuYp9fWc28ub
/6J24Lmlu482Ko8e+rF5DeU6pTGUnYA57AM7hmMCZV2mHwxwULxN1SpgAsTcxOIt
8zUn+Rm3AgMBAAECggEAL2tgIUfmnRbI9yiyuSzvp6zNMNB+7rXmzFNfpJ15HFnw
K8rRn2/+Q06ts/jilFySpdRwMdKmfyCF/FDdFw/ag4IbxxiUu4Ir67wCdaMK+cmG
C2BIthC7xp6+MNezYvoDXr1AffA8CUx6zdUG5C4V+V+SPPWCzyZGBr8PEnbjDQcw
bk3Hl/p/YXYvYs/6+xhp62PItmO6If3auepqtlb8aezTwPve9KbAjy8d1Xtvt4wj
pGSgLkwzJw42e71HY116yZIa+Fj7bVWp+AHLJBO4ExlBaXxGbFANoDD+8zDgG9Vr
vsiw/iHWgNSrlduz+tlmWwuBi/+uHImp3l5hb0jzmQKBgQDq01KcDUonrHVEcO+G
G5NHV5Rh1OwqWrm9n8Y+arNJL0U0azomkMyg2qmF9vq9xbqDIt9VEuIBIBXD+Rix
fS8IE/Lp5myRmds51vaR7Zv/Dctl2bEEri+b3lhtWzCvq4sfjTxFVuNdjrkBUxn7
y2K1DVAOg22VuaPnT/87EHwZswKBgQDFVG4M6iefCbSxcxE41dA5vZQrRpymJy8J
RAmyNzudCMoUVjXiBaBADL431X5kgiuQUho4dLJBRh+VWEiHgIbpeQxWtGkc0uY3
xjO06ZugJROvlxuezLmUjKsxV80WOv9jR+Y2qBoxNFhsNgtQod4SKPLIR73nP//E
m1vNZQ/17QKBgQDmOKB5Fh5pnw6pNv/dvxM5koeLErEnJSOM4SP+9aUoTwvORIIS
ZUv5D+eTy3wwqbYd8wZ55bVl3Qr5wzGOcWi2xrgU0TAH34uqvTGoCAg0mlWbWT3P
lOZgLjELpaep0sjm+hTo9jKa+t4uikajMddoIdEnKXs6m3IxyaA1TAgfOQKBgQCh
vkCuSUfMrhHz2VNmeKtCiMfoaOqBrmB5gdFIyMkOQGQTI07rQp1FoqxP66i8DY5T
r1haqhxqMGY27bQVjR4IRPX+I8Z8n8mgMc+0HD85lup55Kv5D+mVf2/a9BLgg99N
q2NhrYw6hKNtnybLIsJ5tCK8U0GvSOAGcSlgQ9Q/SQKBgQDSb4qYm7a8veOc+ACm
rx/Vf4ybcawziBS/QDhdOM4NCiCDa/nfMn4tnw+VDdjDOtq0GC0AffvMigbXr54o
pKWhaq4iMDkV0ySH9616f/+D4+vyptYEJsRVeNeRXfffvI7drnNj7yDfdo8ttj7P
j3uyk/Lpy9B3Grfbha2sWA/CdQ==
-----END PRIVATE KEY-----
`;
//#endregion
//#region src/engine.ts
var RedfishClient = class {
	host;
	user;
	pass;
	token = null;
	constructor(bmc) {
		this.host = bmc.host;
		this.user = bmc.user;
		this.pass = bmc.pass;
	}
	req(method, uri, body, extraHeaders) {
		return new Promise((resolve, reject) => {
			const data = body !== void 0 ? JSON.stringify(body) : null;
			const headers = {
				"Content-Type": "application/json",
				"Accept": "application/json",
				"Content-Length": data ? String(Buffer.byteLength(data)) : "0",
				...extraHeaders
			};
			if (this.token) headers["X-Auth-Token"] = this.token;
			else headers["Authorization"] = "Basic " + Buffer.from(`${this.user}:${this.pass}`).toString("base64");
			const r = https.request({
				host: this.host,
				path: uri,
				method,
				headers,
				rejectUnauthorized: false,
				timeout: 3e4
			}, (res) => {
				let buf = "";
				res.on("data", (c) => {
					buf += c;
				});
				res.on("end", () => {
					let json = null;
					try {
						json = buf ? JSON.parse(buf) : null;
					} catch (e) {}
					resolve({
						status: res.statusCode,
						headers: res.headers,
						json,
						raw: buf
					});
				});
			});
			r.on("error", reject);
			r.on("timeout", () => r.destroy(/* @__PURE__ */ new Error("request timeout")));
			if (data) r.write(data);
			r.end();
		});
	}
	get(u) {
		return this.req("GET", u);
	}
	post(u, b) {
		return this.req("POST", u, b);
	}
	patch(u, b, extra) {
		return this.req("PATCH", u, b, extra);
	}
	async getSystem() {
		const r = await this.get("/redfish/v1/Systems/1");
		if (r.status !== 200) throw new Error(`getSystem -> HTTP ${r.status}`);
		return r.json;
	}
	async getStorage() {
		try {
			const r = await this.get("/redfish/v1/Systems/1/Storage");
			if (r.status !== 200) return null;
			const storages = [];
			for (const m of r.json.Members || []) {
				const sr = await this.get(m["@odata.id"]);
				if (sr.status === 200) storages.push(sr.json);
			}
			for (const s of storages) {
				if (s.Drives) {
					s.driveDetails = [];
					for (const d of s.Drives) {
						const dr = await this.get(d["@odata.id"]);
						if (dr.status === 200) s.driveDetails.push(dr.json);
					}
				}
				if (s.Volumes) {
					const vr = await this.get(s.Volumes["@odata.id"]);
					if (vr.status === 200) {
						s.volumeDetails = [];
						for (const v of (vr.json.Members || []).slice(0, 5)) {
							const vm = await this.get(v["@odata.id"]);
							if (vm.status === 200) s.volumeDetails.push(vm.json);
						}
					}
				}
			}
			return storages;
		} catch (e) {
			return null;
		}
	}
	/**
	* 从 Chassis/Drives 枚举物理盘。鲲鹏 iBMC 等固件不实现
	* Systems/1/Storage（404），磁盘挂在 Chassis 下：
	*   /redfish/v1/Chassis/{id} → Drives → /redfish/v1/Chassis/{id}/Drives/{disk}
	*/
	async getChassisDrives() {
		try {
			const col = await this.get("/redfish/v1/Chassis");
			if (col.status !== 200 || !col.json) return [];
			const drives = [];
			for (const m of col.json.Members || []) {
				const ch = await this.get(m["@odata.id"]);
				if (ch.status !== 200 || !ch.json || !ch.json.Drives) continue;
				const dcol = await this.get(ch.json.Drives["@odata.id"]);
				if (dcol.status !== 200 || !dcol.json) continue;
				for (const dl of dcol.json.Members || []) {
					const dr = await this.get(dl["@odata.id"]);
					if (dr.status === 200 && dr.json) drives.push(dr.json);
				}
			}
			return drives;
		} catch (e) {
			return [];
		}
	}
	async patchSystem(body) {
		const g = await this.get("/redfish/v1/Systems/1");
		const etag = g.headers && g.headers["etag"];
		const extra = {};
		if (etag) extra["If-Match"] = etag;
		const r = await this.patch("/redfish/v1/Systems/1", body, extra);
		if (r.status !== 200 && r.status !== 204) throw new Error(`patchSystem -> HTTP ${r.status} ${r.raw ? r.raw.slice(0, 200) : ""}`);
	}
	async setBootOnce(target) {
		await this.patchSystem({ Boot: {
			BootSourceOverrideEnabled: "Once",
			BootSourceOverrideTarget: target
		} });
	}
	async power(action) {
		const r = await this.post("/redfish/v1/Systems/1/Actions/ComputerSystem.Reset", { ResetType: action });
		if (r.status !== 200 && r.status !== 204) throw new Error(`power ${action} -> HTTP ${r.status}`);
	}
	async vmediaConnect(imageUrl) {
		const r = await this.post("/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl", {
			VmmControlType: "Connect",
			Image: imageUrl
		});
		if (r.status >= 400) throw new Error(`vmediaConnect -> HTTP ${r.status}`);
	}
	async vmediaDisconnect() {
		const r = await this.post("/redfish/v1/Managers/1/VirtualMedia/CD/Oem/Huawei/Actions/VirtualMedia.VmmControl", { VmmControlType: "Disconnect" });
		if (r.status >= 400) throw new Error(`vmediaDisconnect -> HTTP ${r.status}`);
	}
	async vmediaStatus() {
		const r = await this.get("/redfish/v1/Managers/1/VirtualMedia/CD");
		if (r.status !== 200) throw new Error(`vmediaStatus -> HTTP ${r.status}`);
		return r.json;
	}
};
function generateSelfSignedCert() {
	const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
		modulusLength: 2048,
		publicKeyEncoding: {
			type: "spki",
			format: "pem"
		},
		privateKeyEncoding: {
			type: "pkcs8",
			format: "pem"
		}
	});
	return {
		cert: publicKey,
		key: privateKey
	};
}
function genKickstart(spec, serverIp, httpPort) {
	const pw = spec.rootPassword;
	const mask = prefixToMask(spec.osPrefixLen);
	const dns = (spec.osDns || ["114.114.114.114"]).join(" ");
	const packages = buildPackageList(spec.vendor, spec.components);
	const base = `http://${serverIp}:${httpPort}/repo/${spec.distroId}`;
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
# 网络配置快照：安装器环境实际生效的地址与路由（slim 模式下 dracut 已配好）
__R net-config "addr=$(ip -o -4 addr show scope global 2>/dev/null | awk '{print $2, $4}' | tr '\\n' '|') default=$(ip route show default 2>/dev/null | head -1)"
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
__R2() { curl -s -m 8 -G --data-urlencode "m=deploy" --data-urlencode "task=${spec.taskId}" --data-urlencode "stage=$1" --data-urlencode "d=$2" "http://${serverIp}:${httpPort}/report" >/dev/null 2>&1 || true; }
__R2 post-ssh "PermitRootLogin=yes"
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
__R2 post-service "osdeploy-report enabled"
%end
`;
}
function genPreseed(spec, serverIp, httpPort) {
	const pw = spec.rootPassword;
	const dns = (spec.osDns || ["114.114.114.114"]).join(" ");
	const base = `http://${serverIp}:${httpPort}/report`;
	const components = buildPackageList(spec.vendor, spec.components);
	const sn = spec.diskSn || "";
	const cap = spec.diskCapacityBytes || 0;
	let partman = [
		`d-i partman/early_command string \\`,
		`  DEV="" ; \\`,
		`  for d in /dev/disk/by-id/* ; do \\`,
		`    case "$d" in *-part*) continue ;; esac ; \\`,
		`    case "$d" in *"${sn}"*) DEV="$d"; break ;; esac ; \\`,
		`  done ; \\`
	];
	if (cap > 0) partman = partman.concat([
		`  if [ -z "$DEV" ] ; then \\`,
		`    MATCHES="" ; \\`,
		`    for b in /sys/block/sd* ; do \\`,
		`      b=$(basename "$b") ; \\`,
		`      sz=$(( $(cat /sys/block/$b/size 2>/dev/null || echo 0) * 512 )) ; \\`,
		`      diff=$(( sz - ${cap} )) ; [ $diff -lt 0 ] && diff=$(( -diff )) ; \\`,
		`      if [ $(( diff * 100 / ${cap} )) -le 2 ] ; then MATCHES="$MATCHES /dev/$b" ; fi ; \\`,
		`    done ; \\`,
		`    if [ "$(echo $MATCHES | wc -w)" -eq 1 ] ; then DEV=$(echo $MATCHES) ; fi ; \\`,
		`  fi ; \\`
	]);
	partman = partman.concat([
		`  if [ -n "$DEV" ] ; then \\`,
		`    wget -q -O /dev/null "${base}?task=${spec.taskId}&stage=disk-resolved&d=$DEV" || true ; \\`,
		`    . /usr/share/debconf/confmodule ; \\`,
		`    db_set partman-auto/disk "$DEV" ; \\`,
		`  else \\`,
		`    wget -q -O /dev/null "${base}?task=${spec.taskId}&stage=fatal&d=disk-not-found-at-partman" || true ; \\`,
		`  fi ; \\`,
		`  true`
	]);
	return `#### osdeploy generated preseed
d-i debian-installer/locale string en_US.UTF-8
d-i keyboard-configuration/xkb-keymap select us
d-i console-setup/ask_detect boolean false
d-i hw-detect/load_firmware boolean false
d-i netcfg/confirm_static boolean true
d-i netcfg/disable_autoconfig boolean true
d-i netcfg/get_ipaddress string ${spec.osIp}
d-i netcfg/get_netmask string ${prefixToMask(spec.osPrefixLen)}
d-i netcfg/get_gateway string ${spec.osGateway}
d-i netcfg/get_nameservers string ${dns}
d-i netcfg/get_hostname string ${spec.hostname}
d-i netcfg/get_domain string local
d-i mirror/country string manual
d-i mirror/http/hostname string ${serverIp}:${httpPort}
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
${partman.join("\n")}
d-i partman-partitioning/confirm_write_new_label boolean true
d-i partman/choose_partition select finish
d-i partman/confirm boolean true
d-i partman/confirm_nooverwrite boolean true
d-i debian-installer/allow_unauthenticated boolean true
d-i grub-installer/only_debian boolean true
d-i grub-installer/with_other_os boolean false
d-i debian-installer/add-kernel-opts string console=tty0 console=ttyS0,115200n8
d-i pkgsel/include string ${components.replace(/\n/g, " ")}
d-i pkgsel/upgrade select none
d-i popularity-contest/participate boolean false
d-i finish-install/reboot_in_progress note

d-i preseed/early_command string \\
  mkdir -p /etc/apt/apt.conf.d ; \\
  printf '%s\\n' 'Acquire::AllowInsecureRepositories "true";' 'APT::Get::AllowUnauthenticated "true";' > /etc/apt/apt.conf.d/99osdeploy.conf ; \\
  sh -c "while [ ! -d /target/etc/apt/apt.conf.d ]; do sleep 2; done; cp /etc/apt/apt.conf.d/99osdeploy.conf /target/etc/apt/apt.conf.d/99osdeploy.conf" & \\
  wget -q -O /dev/null "${base}?task=${spec.taskId}&stage=early-apt-config" || true

d-i preseed/late_command string \\
  in-target sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config ; \\
  mkdir -p /target/etc/osdeploy ; \\
  printf '{"machine":"${spec.hostname}","targetSn":"${sn}"}\\n' > /target/etc/osdeploy/info.json ; \\
  in-target sh -c "printf '[Unit]\\nDescription=osdeploy firstboot report\\nAfter=network-online.target\\nWants=network-online.target\\n\\n[Service]\\nType=oneshot\\nExecStart=/usr/bin/curl -s -m 10 \\"${base}?task=${spec.taskId}&stage=firstboot\\"\\n\\n[Install]\\nWantedBy=multi-user.target\\n' > /etc/systemd/system/osdeploy-report.service; systemctl enable osdeploy-report.service" || true ; \\
  in-target curl -s -m 10 "${base}?task=${spec.taskId}&stage=post-install" || true
`;
}
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
function genVmediaGrubCfg(spec, isoLabel, opts) {
	const slim = !!opts?.slim;
	const serverIp = opts.serverIp;
	const httpPort = opts?.httpPort || 8080;
	const kargs = [];
	if (slim) {
		kargs.push(`inst.stage2=http://${serverIp}:${httpPort}/repo/${spec.distroId}/`);
		const mac = String(spec.nicMac || "").toLowerCase();
		const mask = prefixToMask(spec.osPrefixLen);
		if (mac) kargs.push(`ifname=netboot0:${mac}`);
		kargs.push(`ip=${spec.osIp}::${spec.osGateway}:${mask}:${spec.hostname || "osdeploy"}:netboot0:none`);
		kargs.push(`nameserver=${(spec.osDns || ["114.114.114.114"])[0]}`);
	} else kargs.push(`inst.stage2=hd:LABEL=${isoLabel}`);
	kargs.push(`inst.ks=hd:LABEL=${isoLabel}:/ks.cfg`, `ro`, `inst.geoloc=0`, `inst.cmdline`, `inst.remotelog=${serverIp}:514`, `rd.syslog=${serverIp}`, `console=tty0 console=ttyS0,115200n8`, `smmu.bypassdev=0x1000:0x17`, `smmu.bypassdev=0x1000:0x15`, `video=efifb:off`, `fpi_to_tail=off`);
	return `# osdeploy generated (virtual media${slim ? ", slim" : ""}) grub.cfg for ${spec.hostname || spec.osIp}
set default=0
set timeout=3
menuentry 'osdeploy ${spec.distroId} (${spec.hostname || spec.osIp})' --class gnu-linux {
  search --no-floppy --set=root -l '${isoLabel}'
  linux /images/pxeboot/vmlinuz ${kargs.join(" ")}
  initrd /images/pxeboot/initrd.img
}
`;
}
/** Debian HTTP 引导 grub.cfg：kernel/initrd 由 grub 自身网络栈经 HTTP 拉取。 */
function genDebianHttpGrubCfg(spec, serverIp, httpPort) {
	const mask = prefixToMask(spec.osPrefixLen);
	const kargs = [
		"auto=true",
		"priority=critical",
		`preseed/url=http://${serverIp}:${httpPort}/ks/${spec.taskId}.ks`,
		"locale=en_US.UTF-8",
		"keymap=us",
		"netcfg/disable_autoconfig=true",
		"netcfg/choose_interface=auto",
		"netcfg/link_wait_timeout=15",
		`netcfg/get_ipaddress=${spec.osIp}`,
		`netcfg/get_netmask=${mask}`,
		`netcfg/get_gateway=${spec.osGateway}`,
		`netcfg/get_nameservers=${(spec.osDns || ["114.114.114.114"]).join(" ")}`,
		"netcfg/confirm_static=true",
		`netcfg/get_hostname=${spec.hostname}`,
		"console=tty0",
		"console=ttyS0,115200n8"
	].join(" ");
	return `# osdeploy generated grub.cfg — Debian HTTP boot
set default=0
set timeout=5
menuentry 'osdeploy ${spec.distroId} (${spec.hostname || spec.osIp})' --class gnu-linux {
  net_add_addr e0 efinet0 ${spec.osIp}
  linux (http,${serverIp}:${httpPort})/repo/${spec.distroId}/netboot-kernel ${kargs}
  initrd (http,${serverIp}:${httpPort})/repo/${spec.distroId}/netboot-initrd.gz
}
`;
}
function buildPackageList(vendor, components) {
	const lines = [];
	const compSet = new Set(components);
	if (vendor === "debian") {
		if (compSet.has("core") || compSet.size === 0) lines.push("openssh-server", "curl");
		if (compSet.has("devel")) lines.push("build-essential", "gcc", "make", "gdb", "git");
		if (compSet.has("ssh-server")) lines.push("openssh-server");
	} else {
		lines.push("@core");
		if (compSet.has("ssh-server") || compSet.size === 0) lines.push("openssh-server");
		lines.push("curl", "wget", "tar");
		if (compSet.has("devel")) lines.push("@development", "gcc", "gcc-c++", "make", "gdb", "git");
		if (compSet.has("minimal-extra")) lines.push("vim", "net-tools", "bind-utils");
	}
	return lines.join("\n");
}
function prefixToMask(prefix) {
	const mask = 4294967295 << 32 - prefix >>> 0;
	return [
		mask >>> 24 & 255,
		mask >>> 16 & 255,
		mask >>> 8 & 255,
		mask & 255
	].join(".");
}
/**
* 极简 RFC3164 syslog 收集器（UDP 514 + TCP 514）。
* 引导参数 rd.syslog=<ip>（dracut 阶段，UDP）与 inst.remotelog=<ip>:514
* （anaconda，TCP 明文行）都会推到这里——安装器的每一条日志（软件包
* 安装、存储配置、网络配置、错误）实时到达，是安装过程观测的王牌通道。
* 原始 osdeploy 工具实证此机制在鲲鹏 iBMC + openEuler/麒麟上可用。
*/
var SyslogCollector = class {
	sock = null;
	tcp = null;
	port;
	stream = null;
	lines = 0;
	onLine = null;
	constructor(port = 514, logFile) {
		this.port = port;
		if (logFile) {
			fs.mkdirSync(path.dirname(logFile), { recursive: true });
			this.stream = fs.createWriteStream(logFile, { flags: "a" });
		}
	}
	start() {
		return new Promise((resolve, reject) => {
			this.sock = dgram.createSocket("udp4");
			this.sock.on("error", (e) => reject(e));
			this.sock.on("message", (buf, rinfo) => this.onMessage(buf, rinfo.address));
			this.sock.bind(this.port, () => {
				console.log(`[osdeploy] syslog collector listening on udp/${this.port}`);
				resolve();
			});
			this.tcp = net.createServer((sock) => {
				const ip = (sock.remoteAddress || "").replace(/^::ffff:/, "");
				let buf = "";
				sock.on("data", (d) => {
					buf += d.toString("utf8");
					let i;
					while ((i = buf.indexOf("\n")) >= 0) {
						const line = buf.slice(0, i).replace(/\0+$/, "");
						buf = buf.slice(i + 1);
						if (line.trim()) this.onMessage(Buffer.from(line, "utf8"), ip);
					}
				});
				sock.on("error", () => {});
			});
			this.tcp.on("error", () => {});
			this.tcp.listen(this.port);
		});
	}
	stop() {
		try {
			if (this.sock) this.sock.close();
		} catch {}
		try {
			if (this.tcp) this.tcp.close();
		} catch {}
		try {
			if (this.stream) this.stream.end();
		} catch {}
		this.sock = null;
		this.tcp = null;
	}
	onMessage(buf, ip) {
		const raw = buf.toString("utf8").replace(/\0+$/, "");
		const m = /^<(\d+)>([\s\S]*)$/.exec(raw);
		const pri = m ? parseInt(m[1] || "13", 10) : 13;
		const rest = m ? m[2] || "" : raw;
		this.lines++;
		if (this.stream) this.stream.write(`${(/* @__PURE__ */ new Date()).toISOString()} ${ip} ${rest}\n`);
		if (this.onLine) try {
			this.onLine({
				ip,
				severity: pri % 8,
				msg: rest
			});
		} catch {}
	}
};
var DeployHttpServer = class {
	server = null;
	tlsServer = null;
	port;
	tlsPort;
	roots = /* @__PURE__ */ new Map();
	reportHandler = null;
	accessHandler = null;
	/** HTTPS 443 是否成功监听（iBMC 虚拟光驱要求 https:// 镜像 URL） */
	httpsUp = false;
	httpsError = "";
	constructor(port, tlsPort = 443) {
		this.port = port;
		this.tlsPort = tlsPort;
	}
	setRoot(prefix, dir) {
		this.roots.set(prefix, dir);
	}
	removeRoot(prefix) {
		this.roots.delete(prefix);
	}
	onReport(handler) {
		this.reportHandler = handler;
	}
	/** 所有静态文件访问回调（/iso 的 BMC 拉取、/repo 的安装器取包都经此观测） */
	onAccess(handler) {
		this.accessHandler = handler;
	}
	start(tls) {
		return new Promise((resolve, reject) => {
			const handler = (req, res) => {
				try {
					this.handle(req, res);
				} catch (e) {
					res.writeHead(500);
					res.end("error");
				}
			};
			this.server = http.createServer(handler);
			this.server.on("error", reject);
			this.server.listen(this.port, "0.0.0.0", () => {
				resolve();
				if (tls && tls.cert && tls.key) {
					this.tlsServer = https.createServer({
						cert: tls.cert,
						key: tls.key
					}, handler);
					this.tlsServer.on("error", (e) => {
						this.httpsUp = false;
						this.httpsError = String(e?.code || e.message);
						console.error(`[osdeploy] HTTPS :${this.tlsPort} listen failed: ${this.httpsError} (虚拟光驱将不可用)`);
					});
					this.tlsServer.listen(this.tlsPort, "0.0.0.0", () => {
						this.httpsUp = true;
						console.log(`[osdeploy] HTTPS server listening on 0.0.0.0:${this.tlsPort} (虚拟光驱)`);
					});
				} else this.httpsError = "no TLS certificate";
			});
		});
	}
	stop() {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
		if (this.tlsServer) {
			this.tlsServer.close();
			this.tlsServer = null;
		}
		this.httpsUp = false;
	}
	handle(req, res) {
		const u = new URL(req.url || "/", "http://localhost");
		const ip = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
		if (u.pathname === "/report" || u.pathname === "/report/") {
			const q = u.searchParams;
			if (this.reportHandler) this.reportHandler(q, ip);
			res.writeHead(200);
			res.end("ok");
			return;
		}
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405);
			res.end();
			return;
		}
		let pathname = u.pathname;
		try {
			pathname = decodeURIComponent(u.pathname);
		} catch (e) {}
		const prefix = Array.from(this.roots.keys()).filter((p) => pathname === p || pathname.startsWith(p + "/") || p === "/").sort((a, b) => b.length - a.length)[0];
		if (!prefix) {
			res.writeHead(404);
			res.end("not found");
			return;
		}
		const rel = pathname.slice(prefix === "/" ? 0 : prefix.length).replace(/^\/+/, "");
		const fp = path.join(this.roots.get(prefix), rel);
		const rootAbs = path.resolve(this.roots.get(prefix));
		if (!path.resolve(fp).startsWith(rootAbs)) {
			res.writeHead(403);
			res.end();
			return;
		}
		fs.stat(fp, (e, st) => {
			if (e || !st.isFile()) {
				res.writeHead(404);
				res.end("not found");
				return;
			}
			const total = st.size;
			let start = 0, end = total - 1, code = 200;
			const range = req.headers["range"];
			if (range) {
				const m = /^bytes=(\d*)-(\d*)$/.exec(String(range));
				if (m) {
					if (m[1]) start = parseInt(m[1]);
					if (m[2]) end = Math.min(parseInt(m[2]), total - 1);
					else end = total - 1;
					code = 206;
				}
			}
			const len = end - start + 1;
			res.writeHead(code, {
				"Content-Length": len,
				"Accept-Ranges": "bytes",
				...code === 206 ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}
			});
			if (this.accessHandler) try {
				this.accessHandler({
					path: pathname,
					method: req.method || "",
					status: code,
					bytes: len,
					ip
				});
			} catch {}
			if (req.method === "HEAD") {
				res.end();
				return;
			}
			const stream = fs.createReadStream(fp, {
				start,
				end
			});
			stream.on("error", () => {
				try {
					res.destroy();
				} catch (e) {}
			});
			stream.pipe(res);
		});
	}
};
function extractIso(isoPath, outDir) {
	try {
		fs.mkdirSync(outDir, { recursive: true });
		execFileSync("tar", [
			"-xf",
			isoPath,
			"-C",
			outDir
		], {
			timeout: 6e5,
			stdio: "pipe"
		});
		return { ok: true };
	} catch (e) {
		const hasPackages = fs.existsSync(path.join(outDir, "Packages")) || fs.existsSync(path.join(outDir, "pool"));
		const hasDists = fs.existsSync(path.join(outDir, "dists")) || fs.existsSync(path.join(outDir, ".treeinfo"));
		if (hasPackages || hasDists) return { ok: true };
		return {
			ok: false,
			error: String(e.message || e)
		};
	}
}
/**
* Debian 仓库资产校验（幂等、只读）。
*
* 关键事实（原 osdeploy 工具 9/18-9/20 实证）：Debian DVD 的 install.a64/
* initrd.gz 含 cdrom-detect，期望在虚拟光驱上找到安装媒体——而我们的小
* 迷你 ISO 只有 grub，没有 dists/pool → d-i 卡死在"检测安装媒体"。
* 必须用真正的 netboot initrd（deb.debian.org 的 netboot/gtk/cdrom 之外的
* 纯网络启动 initrd，无 cdrom-detect）+ 匹配版本的内核 udeb。
*
* 因此本函数不再从 install.a64 拷贝（那会制造"看起来有、实则必死"的资产），
* 而是校验：netboot 资产存在且不是 install.a64 的逐字节副本（即不是 DVD
* cdrom initrd）；dists 签名元数据存在（缺失则告警，未签名靠 99osdeploy.conf
* 放行亦可，但签名更稳）。
*/
function ensureDebianRepoAssets(repoDir) {
	try {
		const nbKernel = path.join(repoDir, "netboot-kernel");
		const nbInitrd = path.join(repoDir, "netboot-initrd.gz");
		const iaKernel = path.join(repoDir, "install.a64", "vmlinuz");
		const iaInitrd = path.join(repoDir, "install.a64", "initrd.gz");
		if (!fs.existsSync(nbKernel) || !fs.existsSync(nbInitrd)) return {
			ok: false,
			error: `缺少 Debian netboot 引导资产（${path.basename(repoDir)}/netboot-kernel 与 netboot-initrd.gz）。\n注意：不能直接用 install.a64/ 下的 vmlinuz/initrd.gz——那是 DVD 的 cdrom 安装器 initrd，含 cdrom-detect，\n而我们的迷你 ISO 没有 dists/pool 安装媒体结构，d-i 会卡死在"检测安装媒体"（9/18 故障根因之一）。\n请用 deb.debian.org/debian/dists/trixie/main/installer-arm64/current/images/netboot/netboot.tar.gz 中的\n真 netboot kernel+initrd 放到仓库根，并确保 pool 里有匹配版本的内核 udeb（6.12.107 等）。\n（本机已从原 osdeploy 工具的已验证仓库同步过这套资产——若刚重新解包镜像则需重新同步。）`
		};
		const sameSize = (a, b) => {
			try {
				return fs.existsSync(a) && fs.existsSync(b) && fs.statSync(a).size === fs.statSync(b).size;
			} catch {
				return false;
			}
		};
		const sameBytes = (a, b) => {
			if (!sameSize(a, b)) return false;
			try {
				return fs.readFileSync(a).equals(fs.readFileSync(b));
			} catch {
				return false;
			}
		};
		if (fs.existsSync(iaInitrd) && sameBytes(nbInitrd, iaInitrd) || fs.existsSync(iaKernel) && sameBytes(nbKernel, iaKernel)) return {
			ok: false,
			error: "netboot-initrd.gz 与 install.a64/initrd.gz 逐字节相同——这是 DVD 的 cdrom 安装器 initrd（含 cdrom-detect），\n我们的迷你 ISO 无安装媒体结构，d-i 必卡死在\"检测安装媒体\"（9/18 故障根因之一）。\n请用 deb.debian.org 的真 netboot initrd 替换 netboot-initrd.gz / netboot-kernel，并同步匹配版本的内核 udeb。\n（本机已从原 osdeploy 工具仓库同步过正确的 netboot 资产——若刚重新解包镜像则需重新同步。）"
		};
		const suiteDir = path.join(repoDir, "dists", "trixie");
		const hasInRelease = fs.existsSync(path.join(suiteDir, "InRelease"));
		const hasRelease = fs.existsSync(path.join(suiteDir, "Release"));
		const hasGpg = fs.existsSync(path.join(suiteDir, "Release.gpg"));
		if (!hasRelease) return {
			ok: false,
			error: `缺少 dists/trixie/Release（仓库结构不完整，请重新解包镜像）`
		};
		let warning;
		if (!hasInRelease || !hasGpg) warning = `dists/trixie 缺 ${[!hasInRelease && "InRelease", !hasGpg && "Release.gpg"].filter(Boolean).join("/")}（未签名仓库靠 99osdeploy.conf 放行，可用但建议补齐签名文件）`;
		return {
			ok: true,
			warning
		};
	} catch (e) {
		return {
			ok: false,
			error: String(e?.message || e)
		};
	}
}
var DeployRunner = class {
	rf;
	spec;
	serverIp;
	httpPort;
	progress;
	cancelled = false;
	/** 本任务收到的安装器回报阶段（成功判定的证据；见 markReport） */
	stages = /* @__PURE__ */ new Set();
	constructor(spec, serverIp, httpPort, progress) {
		this.spec = spec;
		this.serverIp = serverIp;
		this.httpPort = httpPort;
		this.progress = progress;
		this.rf = new RedfishClient(spec.bmc);
	}
	cancel() {
		this.cancelled = true;
	}
	/**
	* 安装器回报入口（由 service 的 /report 处理器调用）。
	* 回报 URL 携带 task=<id>，因此旧系统开机自报（带上一个任务的 id）
	* 不会计入本任务——这是"安装是否真的发生"的判据。
	*/
	markReport(stage) {
		if (!this.stages.has(stage)) {
			this.stages.add(stage);
			this.progress("installing", -1, `[installer] ${stage}`);
		}
	}
	async run() {
		try {
			this.progress("preflight", 2, "Probing BMC...");
			const sys = await this.rf.getSystem();
			this.progress("preflight", 5, `BMC ok: ${sys.Model || "unknown"} power=${sys.PowerState}`);
			if (this.cancelled) return {
				ok: false,
				error: "cancelled"
			};
			const isDebian = this.spec.vendor === "debian";
			const slim = this.spec.vendor === "kylin";
			const isoLabel = ("OSDEPLOY_" + this.spec.taskId).toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 32);
			const isoOut = path.join(this.spec.isoOutDir, `${this.spec.taskId}.iso`);
			this.progress("building", 8, `Building per-machine mini boot ISO [${isDebian ? "debian-http" : slim ? "slim" : "full"}]...`);
			if (isDebian) {
				const assets = ensureDebianRepoAssets(this.spec.repoDir);
				if (!assets.ok) throw new Error(assets.error);
				if (assets.warning) this.progress("building", 8, assets.warning.slice(0, 200));
				if (!this.spec.efiBootSrc || !fs.existsSync(this.spec.efiBootSrc)) throw new Error("Debian 部署需要一个已解包的 openEuler 或麒麟镜像（借用其 grub 引导镜像，Debian 自家 grub 缺少 http 模块）。请先注册并解包任一 anaconda 系镜像。");
				if (!this.spec.ksDir) throw new Error("ksDir 未配置");
				fs.mkdirSync(this.spec.ksDir, { recursive: true });
				const preseed = genPreseed(this.spec, this.serverIp, this.httpPort);
				fs.writeFileSync(path.join(this.spec.ksDir, `${this.spec.taskId}.ks`), preseed, "utf8");
				const grubD = genDebianHttpGrubCfg(this.spec, this.serverIp, this.httpPort);
				const binfoD = await buildDebianHttpIso({
					repoDir: this.spec.repoDir,
					label: isoLabel,
					grubCfg: grubD,
					out: isoOut,
					grubBootImage: fs.readFileSync(this.spec.efiBootSrc)
				});
				const isoMBD = Math.round(binfoD.size / 1048576);
				this.progress("building", 11, `Debian HTTP-boot mini ISO ready: ${isoOut} (${isoMBD}MB)`);
			} else {
				const ks = genKickstart(this.spec, this.serverIp, this.httpPort);
				const grub = genVmediaGrubCfg(this.spec, isoLabel, {
					slim,
					serverIp: this.serverIp,
					httpPort: this.httpPort
				});
				const binfo = await buildMiniIso({
					repoDir: this.spec.repoDir,
					label: isoLabel,
					ks,
					grubCfg: grub,
					grubCfgPath: "/EFI/BOOT/GRUB.CFG",
					out: isoOut,
					slim
				});
				const isoMB = Math.round(binfo.size / 1048576);
				this.progress("building", 11, `Mini boot ISO ready: ${isoOut} (${isoMB}MB, boot image ${(binfo.bootImageSize / 1048576).toFixed(1)}MB)`);
			}
			this.progress("mounting", 12, "Mounting virtual CD...");
			const imageUrl = `https://${this.serverIp}/iso/${this.spec.taskId}.iso`;
			try {
				const cur = await this.rf.vmediaStatus();
				if (cur && cur.Inserted) {
					this.progress("mounting", 13, `Unmounting existing virtual media (${cur.Image || "unknown image"})`);
					try {
						await this.rf.vmediaDisconnect();
					} catch {}
					await sleep(8e3);
				}
			} catch {}
			this.progress("mounting", 14, `Mounting virtual CD from ${imageUrl} ...`);
			await this.rf.vmediaConnect(imageUrl);
			const isoMB = Math.max(1, Math.round((fs.existsSync(isoOut) ? fs.statSync(isoOut).size : 0) / 1048576));
			const mountTimeoutMs = isoMB <= 400 ? 24e4 : 6e5;
			let inserted = false;
			const t0 = Date.now();
			let poll = 0;
			while (Date.now() - t0 < mountTimeoutMs) {
				if (this.cancelled) {
					await this.rf.vmediaDisconnect().catch(() => {});
					return {
						ok: false,
						error: "cancelled"
					};
				}
				const vmst = await this.rf.vmediaStatus();
				if (vmst.Inserted) {
					if (!vmst.Image || String(vmst.Image).includes(`${this.spec.taskId}.iso`)) {
						inserted = true;
						this.progress("mounting", 18, `Virtual CD mounted (Image=${vmst.Image})`);
						break;
					}
					this.progress("mounting", 15, `Different image mounted (${vmst.Image}) -> disconnecting and retrying`);
					try {
						await this.rf.vmediaDisconnect();
						await sleep(5e3);
						await this.rf.vmediaConnect(imageUrl);
					} catch {}
				}
				await sleep(5e3);
				poll++;
				if (poll % 4 === 0) {
					const waited = Math.round((Date.now() - t0) / 1e3);
					this.progress("mounting", 15, `Waiting for VCD insert (${waited}s/${Math.round(mountTimeoutMs / 1e3)}s, ISO ${isoMB}MB)`);
				}
			}
			if (!inserted) throw new Error(`virtual media did not insert within ${Math.round(mountTimeoutMs / 6e4)} min (ISO ${isoMB}MB; 检查 BMC 到 ${this.serverIp}:443 的连通性/证书)`);
			this.progress("booting", 20, "Setting boot override + restarting...");
			await this.rf.setBootOnce("Cd");
			const powerState = sys.PowerState;
			await this.rf.power(powerState === "On" ? "ForceRestart" : "On");
			this.progress("installing", 25, "Machine booting... waiting for installer reports...");
			const startTime = Date.now();
			const timeoutMs = 18e5;
			while (Date.now() - startTime < timeoutMs) {
				if (this.cancelled) {
					await this.rf.vmediaDisconnect().catch(() => {});
					return {
						ok: false,
						error: "cancelled"
					};
				}
				await sleep(3e4);
				const elapsed = Math.floor((Date.now() - startTime) / 1e3);
				const evidence = this.stages.has("post-install") || this.stages.has("firstboot");
				const pct = Math.min(25 + Math.floor(elapsed / 1800 * 65), 90);
				this.progress("installing", pct, `Waiting for OS to boot (${Math.floor(elapsed / 60)}min${evidence ? ", 安装器已回报" : ""})...`);
				if (await this.trySsh(this.spec.osIp)) {
					if (!evidence) {
						await this.rf.vmediaDisconnect().catch(() => {});
						return {
							ok: false,
							error: "机器 SSH 可达，但未收到本次安装的安装器回报——很可能虚拟光驱引导失败后回落启动了旧系统（旧系统 SSH 同样可达）。请检查 BMC 远程控制台确认引导过程；若确认已实际装好（登录查看 /etc/os-release），可忽略此判定。"
						};
					}
					this.progress("verifying", 95, "SSH is up + installer reports received!");
					await this.rf.vmediaDisconnect().catch(() => {});
					this.progress("done", 100, "Installation complete!");
					return { ok: true };
				}
			}
			await this.rf.vmediaDisconnect().catch(() => {});
			return {
				ok: false,
				error: `timeout waiting for SSH (30 min)；已收到的安装器回报: ${[...this.stages].join(",") || "无"}`
			};
		} catch (e) {
			await this.rf.vmediaDisconnect().catch(() => {});
			return {
				ok: false,
				error: String(e.message || e)
			};
		}
	}
	async trySsh(ip) {
		return new Promise((resolve) => {
			const s = new net.Socket();
			s.setTimeout(5e3);
			s.on("connect", () => {
				s.destroy();
				resolve(true);
			});
			s.on("error", () => resolve(false));
			s.on("timeout", () => {
				s.destroy();
				resolve(false);
			});
			s.connect(22, ip);
		});
	}
};
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
/**
* 探测"通往目标（BMC）的本机源 IP"——用 UDP connect 让系统路由栈选路，
* 不实际发包。多网卡/VPN 场景下比"第一个非内网 IPv4"可靠：BMC 必须能
* 回连到我们选的地址（虚拟光驱 HTTPS 与安装期 HTTP 仓库都依赖它）。
* 探测失败时退化为任意非内网 IPv4。
*/
function getRouteIp(target) {
	return new Promise((resolve) => {
		const fallback = () => {
			const ifs = os.networkInterfaces();
			for (const name of Object.keys(ifs)) {
				const list = ifs[name];
				if (!list) continue;
				for (const i of list) if (i.family === "IPv4" && !i.internal) return resolve(i.address);
			}
			resolve("127.0.0.1");
		};
		try {
			const s = dgram.createSocket("udp4");
			const timer = setTimeout(() => {
				try {
					s.close();
				} catch {}
				fallback();
			}, 3e3);
			s.once("error", () => {
				clearTimeout(timer);
				try {
					s.close();
				} catch {}
				fallback();
			});
			s.connect(443, target, () => {
				const addr = s.address();
				clearTimeout(timer);
				const ip = addr && typeof addr === "object" ? addr.address : "";
				try {
					s.close();
				} catch {}
				if (ip && !ip.startsWith("127.")) resolve(ip);
				else fallback();
			});
		} catch {
			fallback();
		}
	});
}
//#endregion
export { buildMiniIso as _, ensureDebianRepoAssets as a, genKickstart as c, generateSelfSignedCert as d, getRouteIp as f, buildDebianHttpIso as g, FatImage as h, SyslogCollector as i, genPreseed as l, DEFAULT_TLS_KEY as m, DeployRunner as n, extractIso as o, DEFAULT_TLS_CERT as p, RedfishClient as r, genDebianHttpGrubCfg as s, DeployHttpServer as t, genVmediaGrubCfg as u, patchFatFile as v };
