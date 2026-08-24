// dsh-server-manager —— Client 半：设置页「服务器管理」仪表盘
// 通过 `ctx.remote.serverManager` 调用 Host 的 @Remote 方法。
import * as React from 'react'

export const inject = ['slots', 'remote', 'remote.serverManager']

const CSS = `.srvmg-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 2px}.srvmg-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.srvmg-btn{font:inherit;padding:6px 10px;border:1px solid rgba(128,128,128,.5);border-radius:6px;background:rgba(128,128,128,.12);cursor:pointer}.srvmg-btn:hover{background:rgba(128,128,128,.22)}.srvmg-btn:disabled{opacity:.5;cursor:default}.srvmg-btn-danger{color:#e5484d}.srvmg-card{border:1px solid rgba(128,128,128,.35);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}.srvmg-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.srvmg-dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px}.srvmg-on{background:#30a46c}.srvmg-off{background:#e5484d}.srvmg-name{font-weight:600}.srvmg-meta{opacity:.75;font-size:12px}.srvmg-kv{font-size:12px;opacity:.85}.srvmg-field{display:flex;flex-direction:column;gap:2px}.srvmg-input{font:inherit;padding:6px 8px;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent}.srvmg-pre{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:8px;max-height:280px;overflow:auto}.srvmg-h{font-size:13px;font-weight:700;margin:2px 0}.srvmg-badge{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid rgba(128,128,128,.45)}`

export function apply(ctx: any) {
  // 注入样式，卸载时移除
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  })

  const h = React.createElement
  const remote = ctx.remote.serverManager

  function fmt(ts: number | null | undefined) { if (!ts) return '—'; try { return new Date(ts).toLocaleString() } catch (e) { return String(ts) } }
  function btn(label: string, onClick: () => void, cls?: string, disabled?: boolean) { return h('button', { className: 'srvmg-btn' + (cls ? ' ' + cls : ''), onClick, disabled: !!disabled }, label) }
  function field(label: string, value: string, onChange: (v: string) => void, placeholder?: string) { return h('label', { className: 'srvmg-field' }, h('span', { className: 'srvmg-meta' }, label), h('input', { className: 'srvmg-input', value: value || '', placeholder: placeholder || '', onChange: (e: any) => onChange(e.target.value) })) }
  function pre(text: string) { return h('pre', { className: 'srvmg-pre' }, text || '') }
  function renderOut(v: any) { try { return JSON.stringify(v, null, 2) } catch (e) { return String(v) } }
  function renderExec(v: any) {
    if (!v || !v.results) return renderOut(v)
    return v.results.map((r: any) => '[' + (r.ok ? 'OK' : 'FAIL') + '] ' + r.name + ' (' + r.host + ') exit=' + r.exitCode + '\n' + (r.stdout || '') + (r.stderr ? ('\n[stderr]\n' + r.stderr) : '') + (r.error ? ('\n[error] ' + r.error) : '')).join('\n\n')
  }
  function renderBios(v: any) {
    if (!v) return ''
    if (v.ok === false) return renderOut(v)
    if (v.set !== undefined) return '已写入 ' + JSON.stringify(v.set) + (v.note ? '\n' + v.note : '')
    if (v.attribute !== undefined) return v.attribute + ' = ' + JSON.stringify(v.value)
    const attrs = v.attributes || {}
    const keys = Object.keys(attrs)
    return '共 ' + (v.attributeCount || keys.length) + ' 项' + (v.attributeRegistry ? ' · 注册表 ' + v.attributeRegistry : '') + '\n' + keys.map((k: string) => k + ' = ' + JSON.stringify(attrs[k])).join('\n')
  }

  function App() {
    const [data, setData] = React.useState<any>(null)
    const [error, setError] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [msg, setMsg] = React.useState('')
    const [showForm, setShowForm] = React.useState(false)
    const [editId, setEditId] = React.useState<string | null>(null)
    const [form, setForm] = React.useState<any>({})
    const [cmdHost, setCmdHost] = React.useState('')
    const [cmd, setCmd] = React.useState('')
    const [cmdOut, setCmdOut] = React.useState<any>(null)
    const [bmcOut, setBmcOut] = React.useState<any>({})
    const [biosAttr, setBiosAttr] = React.useState('')
    const [biosVal, setBiosVal] = React.useState('')
    const [biosOut, setBiosOut] = React.useState<any>({})
    const [updOut, setUpdOut] = React.useState<any>(null)
    const [confirmId, setConfirmId] = React.useState<string | null>(null)

    React.useEffect(() => {
      let alive = true
      async function run() { try { const d = await remote.listServers(); if (alive) { setData(d); setError('') } } catch (e: any) { if (alive) setError(String(e?.message || e)) } }
      run()
      const timer = setInterval(run, 8000)
      return () => { alive = false; clearInterval(timer) }
    }, [])

    async function refresh() { try { const d = await remote.listServers(); setData(d) } catch (e: any) { setError(String(e?.message || e)) } }

    const servers = (data && data.servers) || []
    const checks = (data && data.checks) || {}
    const onlineCount = servers.filter((s: any) => checks[s.id] && checks[s.id].online).length
    const hasIpmitool = data && data.hasIpmitool
    const bmcTransport = data && data.bmcTransport

    function setF(k: string) { return (v: string) => setForm((f: any) => ({ ...f, [k]: v })) }

    async function doInspect(id?: string) { setBusy(true); setMsg(''); try { const r = await remote.inspect(id ? { id } : {}); setMsg(r && r.ok ? '巡检完成' : ('巡检失败: ' + ((r && r.error) || 'unknown'))); await refresh() } catch (e: any) { setMsg('巡检失败: ' + String(e?.message || e)) } finally { setBusy(false) } }

    async function doDelete(id: string, name: string) {
      if (confirmId !== id) { setConfirmId(id); setMsg('再次点击确认删除 ' + name); return }
      setConfirmId(null)
      try { const r = await remote.deleteServer({ id }); setMsg(r && r.ok ? '已删除' : ('删除失败: ' + ((r && r.error) || 'unknown'))); await refresh() } catch (e: any) { setMsg('删除失败: ' + String(e?.message || e)) }
    }

    function openAdd() { setForm({}); setEditId(null); setShowForm(true) }
    function openEdit(s: any) { setForm({ name: s.name, role: s.role, host: s.host, sshUser: s.sshUser, sshPort: s.sshPort, bmcHost: s.bmcHost, bmcUser: s.bmcUser, bmcPassword: s.bmcPassword, tags: (s.tags || []).join(','), notes: s.notes, enabled: s.enabled }); setEditId(s.id); setShowForm(true) }

    async function doSave() {
      try {
        const r = editId ? await remote.updateServer({ id: editId, patch: form }) : await remote.addServer(form)
        setMsg(r && r.ok ? '已保存' : ('保存失败: ' + ((r && r.error) || 'unknown')))
        if (r && r.ok) { setShowForm(false); setEditId(null); setForm({}); await refresh() }
      } catch (e: any) { setMsg('保存失败: ' + String(e?.message || e)) }
    }

    async function doExec() { if (!cmdHost || !cmd) { setMsg('请选择服务器并输入命令'); return } setCmdOut({ running: true }); try { const r = await remote.exec({ id: cmdHost, command: cmd }); setCmdOut(r) } catch (e: any) { setCmdOut({ ok: false, error: String(e?.message || e) }) } }

    async function doBmc(id: string, action: string) { setBmcOut({ id, action, running: true }); try { const r = await remote.bmcPower({ id, action }); setBmcOut({ id, action, running: false, result: r }) } catch (e: any) { setBmcOut({ id, action, running: false, result: { ok: false, error: String(e?.message || e) } }) } }
    async function doBmcStatus(id: string) { setBmcOut({ id, action: 'status', running: true }); try { const r = await remote.bmcStatus({ id }); setBmcOut({ id, action: 'status', running: false, result: r }) } catch (e: any) { setBmcOut({ id, action: 'status', running: false, result: { ok: false, error: String(e?.message || e) } }) } }
    async function doBiosRead(id: string) { setBiosOut({ id, running: true }); try { const r = await remote.bmcBios({ id }); setBiosOut({ id, running: false, result: r }) } catch (e: any) { setBiosOut({ id, running: false, result: { ok: false, error: String(e?.message || e) } }) } }
    async function doBiosGet(id: string) { if (!biosAttr) { setMsg('请输入属性名'); return } setBiosOut({ id, running: true }); try { const r = await remote.bmcBios({ id, attribute: biosAttr }); setBiosOut({ id, running: false, result: r }) } catch (e: any) { setBiosOut({ id, running: false, result: { ok: false, error: String(e?.message || e) } }) } }
    async function doBiosSet(id: string) { if (!biosAttr) { setMsg('请输入属性名'); return } if (biosVal === '') { setMsg('请输入属性值'); return } setBiosOut({ id, running: true }); try { const r = await remote.bmcBios({ id, attribute: biosAttr, value: biosVal }); setBiosOut({ id, running: false, result: r }) } catch (e: any) { setBiosOut({ id, running: false, result: { ok: false, error: String(e?.message || e) } }) } }

    async function doUpdate() { setUpdOut({ running: true }); try { const r = await remote.update(); setUpdOut(r) } catch (e: any) { setUpdOut({ ok: false, error: String(e?.message || e) }) } }

    function serverCards() {
      if (!servers.length) return h('div', { className: 'srvmg-meta' }, '暂无服务器，点击“新增服务器”添加。')
      return servers.map((s: any) => {
        const c = checks[s.id] || {}
        const m = c.metrics || {}
        return h('div', { key: s.id, className: 'srvmg-card' },
          h('div', { className: 'srvmg-row' },
            h('span', { className: 'srvmg-dot ' + (c.online ? 'srvmg-on' : 'srvmg-off') }),
            h('span', { className: 'srvmg-name' }, s.name || s.host),
            h('span', { className: 'srvmg-meta' }, s.host),
            s.role ? h('span', { className: 'srvmg-badge' }, s.role) : null,
            s.bmcHost ? h('span', { className: 'srvmg-meta' }, 'BMC ' + s.bmcHost) : null,
            (s.tags && s.tags.length) ? h('span', { className: 'srvmg-badge' }, s.tags.join(', ')) : null
          ),
          h('div', { className: 'srvmg-row' },
            c.online
              ? h('span', { className: 'srvmg-kv' }, '在线 · ' + (m.UPTIME || '') + ' · 负载 ' + (m.LOAD || '—') + ' · 内存 ' + (m.MEM || '—') + ' · 磁盘 ' + (m.DISK || '—') + ' · CPU ' + (m.CPUS || '—') + ' 核')
              : h('span', { className: 'srvmg-kv' }, '离线/不可达' + (c.error ? ' · ' + c.error : '')),
            h('span', { className: 'srvmg-meta' }, '上次检查 ' + fmt(c.checkedAt))
          ),
          h('div', { className: 'srvmg-row' },
            btn('巡检', () => doInspect(s.id), undefined, busy),
            btn('电源状态', () => doBmcStatus(s.id), undefined, !s.bmcHost),
            btn('开机', () => doBmc(s.id, 'on'), undefined, !s.bmcHost),
            btn('关机', () => doBmc(s.id, 'off'), undefined, !s.bmcHost),
            btn('重启', () => doBmc(s.id, 'cycle'), undefined, !s.bmcHost),
            btn('编辑', () => openEdit(s)),
            confirmId === s.id ? btn('确认删除?', () => doDelete(s.id, s.name), 'srvmg-btn-danger') : btn('删除', () => doDelete(s.id, s.name), 'srvmg-btn-danger')
          )
        )
      })
    }

    const bmcResultText = bmcOut.result ? renderOut(bmcOut.result) : (bmcOut.running ? '执行中…' : '')
    const biosResultText = biosOut.result ? renderBios(biosOut.result) : (biosOut.running ? '执行中…' : '')

    return h('div', { className: 'srvmg-wrap' },
      h('div', { className: 'srvmg-bar' },
        h('span', { className: 'srvmg-name' }, '服务器纳管'),
        h('span', { className: 'srvmg-meta' }, onlineCount + '/' + servers.length + ' 在线'),
        btn('立即巡检', () => doInspect(undefined), undefined, busy),
        btn('新增服务器', openAdd),
        btn('刷新', refresh),
        h('span', { className: 'srvmg-meta' }, bmcTransport ? ('BMC 通道: ' + bmcTransport + (hasIpmitool ? '' : ' · 未安装 ipmitool，走 Redfish(HTTPS)')) : '')
      ),
      error ? h('div', { className: 'srvmg-kv', style: { color: '#e5484d' } }, '错误: ' + error) : null,
      msg ? h('div', { className: 'srvmg-kv' }, msg) : null,
      showForm ? h('div', { className: 'srvmg-card' },
        h('div', { className: 'srvmg-h' }, editId ? ('编辑 ' + editId) : '新增服务器'),
        h('div', { className: 'srvmg-row' },
          field('名称', form.name, setF('name'), 'server1'),
          field('角色', form.role, setF('role'), 'worker'),
          field('SSH 地址', form.host, setF('host'), '192.168.1.10'),
          field('SSH 用户', form.sshUser, setF('sshUser'), 'root'),
          field('SSH 端口', form.sshPort, setF('sshPort'), '22'),
          field('BMC 地址', form.bmcHost, setF('bmcHost'), '192.168.1.11'),
          field('BMC 用户', form.bmcUser, setF('bmcUser'), 'Administrator'),
          field('BMC 密码', form.bmcPassword, setF('bmcPassword'), ''),
          field('标签', form.tags, setF('tags'), 'a,b'),
          field('备注', form.notes, setF('notes'), '')
        ),
        h('div', { className: 'srvmg-row' },
          btn('保存', doSave),
          btn('取消', () => { setShowForm(false); setEditId(null) })
        )
      ) : null,
      h('div', { className: 'srvmg-h' }, '服务器列表'),
      serverCards(),
      h('div', { className: 'srvmg-h' }, '下发命令'),
      h('div', { className: 'srvmg-card' },
        h('div', { className: 'srvmg-row' },
          h('select', { className: 'srvmg-input', value: cmdHost, onChange: (e: any) => setCmdHost(e.target.value) },
            h('option', { value: '' }, '选择服务器'),
            servers.map((s: any) => h('option', { key: s.id, value: s.id }, s.name + ' (' + s.host + ')'))
          ),
          h('input', { className: 'srvmg-input', style: { flex: 1 }, value: cmd, placeholder: '命令，例如: systemctl status kubelet', onChange: (e: any) => setCmd(e.target.value) }),
          btn('执行', doExec)
        ),
        cmdOut ? pre(cmdOut.running ? '执行中…' : renderExec(cmdOut)) : null
      ),
      h('div', { className: 'srvmg-h' }, 'BMC 电源'),
      h('div', { className: 'srvmg-card' },
        bmcOut.id ? h('div', { className: 'srvmg-meta' }, '目标: ' + bmcOut.id + (bmcOut.action ? ' · 操作: ' + bmcOut.action : '')) : null,
        bmcResultText ? pre(bmcResultText) : null
      ),
      h('div', { className: 'srvmg-h' }, 'BIOS 配置 (Redfish)'),
      h('div', { className: 'srvmg-card' },
        h('div', { className: 'srvmg-row' },
          h('select', { className: 'srvmg-input', value: biosOut.id || '', onChange: (e: any) => setBiosOut({ id: e.target.value }) },
            h('option', { value: '' }, '选择服务器'),
            servers.map((s: any) => h('option', { key: s.id, value: s.id }, s.name + ' (' + s.host + ')'))
          ),
          h('input', { className: 'srvmg-input', value: biosAttr, placeholder: '属性名，如 SecureBoot', onChange: (e: any) => setBiosAttr(e.target.value) }),
          h('input', { className: 'srvmg-input', value: biosVal, placeholder: '属性值 (写入时填)', onChange: (e: any) => setBiosVal(e.target.value) }),
          btn('读取全部', () => doBiosRead(biosOut.id), undefined, !biosOut.id),
          btn('读取单项', () => doBiosGet(biosOut.id), undefined, !biosOut.id || !biosAttr),
          btn('写入', () => doBiosSet(biosOut.id), undefined, !biosOut.id || !biosAttr)
        ),
        biosResultText ? pre(biosResultText) : null
      ),
      h('div', { className: 'srvmg-h' }, '插件更新'),
      h('div', { className: 'srvmg-card' },
        h('div', { className: 'srvmg-row' },
          h('span', { className: 'srvmg-meta' }, '自更新仓库（环境变量 DSH_SERVER_MANAGER_REPO）'),
          btn('更新插件', doUpdate)
        ),
        updOut ? pre(updOut.running ? '拉取中…' : renderOut(updOut)) : null
      )
    )
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'server-manager', order: 50, label: '服务器管理' },
    () => h(App),
  ))
}
