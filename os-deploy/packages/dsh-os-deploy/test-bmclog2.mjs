// 取最新的 BMC OperateLog（新条目在前的排序）+ 当前 Boot 状态
import * as fs from 'fs'
const cred = JSON.parse(fs.readFileSync(process.env.TEMP + '/bmc-cred.json', 'utf8').replace(/^\uFEFF/, ''))
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const base = `https://${cred.host}`

const authRes = await fetch(`${base}/redfish/v1/SessionService/Sessions`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ UserName: cred.user, Password: cred.pass }),
})
const token = authRes.headers.get('x-auth-token') || ''
async function get(uri) {
  const res = await fetch(`${base}${uri}`, { headers: { 'X-Auth-Token': token } })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch { }
  return { status: res.status, json }
}

// OperateLog 前排 = 最新
const ent = await get('/redfish/v1/Managers/1/LogServices/OperateLog/Entries')
const items = ent.json?.Members || []
console.log(`OperateLog（取前 30 = 最新）`)
for (const e of items.slice(0, 30)) {
  console.log(`  [${e.Created}] ${e.Message}`)
}

// 当前 Boot 状态与支持的一次性引导目标
const sys = await get('/redfish/v1/Systems/1')
const b = sys.json?.Boot || {}
console.log('\n== 当前 Boot 状态 ==')
console.log('BootSourceOverrideTarget:', b.BootSourceOverrideTarget)
console.log('BootSourceOverrideEnabled:', b.BootSourceOverrideEnabled)
console.log('AllowableTargets:', JSON.stringify(b['BootSourceOverrideTarget@Redfish.AllowableValues']))
console.log('BootOrder:', JSON.stringify(b.BootOrder))

// UEFI 启动项明细
try {
  const bo = await get('/redfish/v1/Systems/1/BootOptions' + '')
  for (const m of (bo.json?.Members || [])) {
    const o = await get(m['@odata.id'])
    console.log(`  BootOption ${o.json?.Id}: name="${o.json?.DisplayName}" enabled=${o.json?.Enabled} order/uefi=${JSON.stringify(o.json?.UefiDevicePath || '').slice(0, 80)}`)
  }
} catch { /* ignore */ }
