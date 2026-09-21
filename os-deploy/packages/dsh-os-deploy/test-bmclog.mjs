// 读取 BMC 系统日志 —— 找麒麟任务时间窗内的引导事件
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

// 先补一份凭据文件（上一步可能已删）
fs.writeFileSync(process.env.TEMP + '/bmc-cred.json', JSON.stringify(cred))

const lsCol = await get('/redfish/v1/Managers/1/LogServices')
console.log('== LogServices ==', lsCol.status)
const members = lsCol.json?.Members || []
for (const m of members) {
  const svc = await get(m['@odata.id'])
  const name = svc.json?.Id || m['@odata.id']
  const entriesUri = svc.json?.Entries?.['@odata.id']
  console.log(`\n--- ${name} (${m['@odata.id']}) entries: ${entriesUri || '无'} ---`)
  if (!entriesUri) continue
  const ent = await get(entriesUri)
  const items = ent.json?.Members || []
  // 只显示最近 40 条
  for (const e of items.slice(-40)) {
    console.log(`  [${e.Created || e.EventTimestamp || '?'}] ${e.Message || e.Severity || ''} ${e.MessageId ? '(' + e.MessageId + ')' : ''}`)
  }
}
