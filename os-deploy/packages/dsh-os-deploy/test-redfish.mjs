// 对 192.168.2.14 的 iBMC Redfish 实测 —— 复刻插件 getStorage 的取盘路径，
// 找出磁盘为空的确切断点
import * as fs from 'fs'
const cred = JSON.parse(fs.readFileSync(process.env.TEMP + '/bmc-cred.json', 'utf8').replace(/^\uFEFF/, ''))
const base = `https://${cred.host}`

let token = ''
{
  // 先走会话（iBMC 标准 XAuthToken 会话）
  const res = await fetch(`${base}/redfish/v1/SessionService/Sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserName: cred.user, Password: cred.pass }),
  }).catch(e => { throw e })
  token = res.headers.get('x-auth-token') || ''
  console.log('会话创建:', res.status, token ? 'token ✓' : '无 token（将用 Basic）')
}

async function get(uri) {
  const res = await fetch(`${base}${uri}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Auth-Token': token } : { 'Authorization': 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64') }),
    },
  }).catch(e => { throw e })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { }
  return { status: res.status, json, text: text.slice(0, 400) }
}

// 1. Systems 集合 —— 确认成员 ID（代码硬编码 /Systems/1）
const sysCol = await get('/redfish/v1/Systems')
console.log('\n== /redfish/v1/Systems ==', sysCol.status)
console.log('Members:', JSON.stringify(sysCol.json?.Members))

// 2. Storage 集合 —— 代码取 /redfish/v1/Systems/1/Storage（实测 404）
const st1 = await get('/redfish/v1/Systems/1/Storage')
console.log('\n== /redfish/v1/Systems/1/Storage ==', st1.status)

// 3. 探测 Chassis 下的 Drives（鲲鹏 iBMC 常见位置）
const chCol = await get('/redfish/v1/Chassis')
console.log('\n== /redfish/v1/Chassis ==', chCol.status)
console.log('Members:', JSON.stringify(chCol.json?.Members))
for (const m of (chCol.json?.Members || [])) {
  const ch = await get(m['@odata.id'])
  console.log(`\n== ${m['@odata.id']} ==`, ch.status)
  // 列出该资源的顶层键，找 Drives 相关
  const keys = Object.keys(ch.json || {})
  console.log('键:', keys.join(', '))
  if (ch.json?.Drives) {
    console.log('Drives 链接:', JSON.stringify(ch.json.Drives))
    const dcol = await get(ch.json.Drives['@odata.id'])
    console.log(`  Drives 集合 ${ch.json.Drives['@odata.id']}:`, dcol.status, 'Members:', JSON.stringify(dcol.json?.Members))
    for (const dl of (dcol.json?.Members || [])) {
      const dr = await get(dl['@odata.id'])
      const j = dr.json || {}
      console.log(`    Drive: ${dr.status} Name=${j.Name} Id=${j.Id} SN=${j.SerialNumber} Cap=${j.CapacityBytes} Media=${j.MediaType} Protocol=${j.Protocol}`)
    }
  }
}

// 4. 也看看系统资源里有没有其他存储线索（OEM 扩展）
const sys = await get('/redfish/v1/Systems/1')
console.log('\n== /redfish/v1/Systems/1 键 ==', Object.keys(sys.json || {}).join(', '))
if (sys.json?.Oem) console.log('OEM 键:', JSON.stringify(Object.keys(sys.json.Oem)))
