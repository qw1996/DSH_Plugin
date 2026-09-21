// 对 192.168.2.14 验证修复后的磁盘枚举（RedfishClient 层，真实 BMC）
import * as fs from 'fs'
const cred = JSON.parse(fs.readFileSync(process.env.TEMP + '/bmc-cred.json', 'utf8').replace(/^\uFEFF/, ''))
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { RedfishClient } = await import('./lib/engine.js')
const rf = new RedfishClient({ host: cred.host, user: cred.user, pass: cred.pass })

console.log('--- 标准路径 Systems/1/Storage ---')
const storages = await rf.getStorage()
console.log('结果:', storages === null ? 'null（404/不可用）' : `${storages.length} 个存储`)
const sd = storages ? storages.flatMap(s => (s && s.driveDetails) || []) : []
console.log('driveDetails:', sd.length, '块')

console.log('--- 回退路径 Chassis/Drives ---')
const drives = await rf.getChassisDrives()
console.log(`枚举到 ${drives.length} 块盘:`)
for (const d of drives) {
  console.log(`  ${d.Name} | Id=${d.Id} | SN=${d.SerialNumber} | ${(d.CapacityBytes / 1e9).toFixed(0)}GB | ${d.MediaType} ${d.Protocol || ''}`)
}

if (drives.length === 0) { console.error('✗ 未枚举到磁盘'); process.exit(1) }
console.log('\n✓ probeDevice 将返回以上磁盘（标准路径为空时自动回退）')
