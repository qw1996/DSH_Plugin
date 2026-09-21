// dsh-os-deploy —— Client 半：设置页「OS 部署」仪表盘
// 通过 `ctx.remote.osDeploy` 调用 Host 的 @Remote 方法。
//
// 第三方包的 Remote 贡献不会被 dsh-api-remotes 装配（它只内联 monorepo
// 核心包的 typert.remote-client），因此这里自行把生成的贡献挂到
// ctx.remote.$mount —— 挂载后 cordis 的 traceable 代理会按
// reflect.props['remote.osDeploy'] 解析 ctx.remote.osDeploy。
// 注意：inject 不能再声明 'remote.osDeploy'（本插件自己提供它，否则
// 永远 pending）；只声明 'remote'，在 apply 中先挂载再使用。
import * as React from 'react'
// 自引用导入构建产物 ./lib/typert.remote-client.js（host 构建先生成，
// client 构建将其连同 zod 一起内联进浏览器 bundle——与 dsh-api-remotes
// 内联核心包贡献的方式一致）。
import { TYPERT_REMOTE } from '@qinwei/dsh-os-deploy/remote'

export const inject = ['slots', 'remote']

const CSS = `
.osd-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 2px}
.osd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.osd-btn{font:inherit;padding:6px 10px;border:1px solid rgba(128,128,128,.5);border-radius:6px;background:rgba(128,128,128,.12);cursor:pointer}
.osd-btn:hover{background:rgba(128,128,128,.22)}
.osd-btn:disabled{opacity:.5;cursor:default}
.osd-btn-danger{color:#e5484d}
.osd-btn-primary{background:rgba(59,130,246,.25);border-color:rgba(59,130,246,.5)}
.osd-card{border:1px solid rgba(128,128,128,.35);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.osd-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.osd-dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px}
.osd-queued{background:#888}.osd-running{background:#f5c542;animation:osd-pulse 1.5s infinite}
.osd-success{background:#30a46c}.osd-failed{background:#e5484d}.osd-cancelled{background:#888}
.osd-off{background:#888}
@keyframes osd-pulse{0%,100%{opacity:1}50%{opacity:.5}}
.osd-name{font-weight:600}
.osd-meta{opacity:.75;font-size:12px}
.osd-kv{font-size:12px;opacity:.85}
.osd-field{display:flex;flex-direction:column;gap:2px;min-width:140px}
.osd-input{font:inherit;padding:6px 8px;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent}
.osd-select{font:inherit;padding:6px 8px;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent}
.osd-pre{white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border:1px solid rgba(128,128,128,.25);border-radius:8px;padding:8px;max-height:300px;overflow:auto}
.osd-h{font-size:13px;font-weight:700;margin:2px 0}
.osd-badge{font-size:11px;padding:1px 7px;border-radius:999px;border:1px solid rgba(128,128,128,.45)}
.osd-progress{height:6px;border-radius:3px;background:rgba(128,128,128,.2);overflow:hidden}
.osd-progress-bar{height:100%;border-radius:3px;transition:width .3s}
.osd-progress-running{background:#f5c542}.osd-progress-success{background:#30a46c}.osd-progress-failed{background:#e5484d}
.osd-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(128,128,128,.3);padding-bottom:6px}
.osd-tab{padding:6px 12px;border-radius:6px 6px 0 0;cursor:pointer;font-size:13px}
.osd-tab-active{background:rgba(59,130,246,.15);font-weight:600}
.osd-log{font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:1.5;max-height:250px;overflow:auto;background:rgba(0,0,0,.15);border-radius:6px;padding:8px}
.osd-log-info{color:#aaa}.osd-log-warn{color:#f5c542}.osd-log-error{color:#e5484d}.osd-log-success{color:#30a46c}
.osd-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;border:1px solid rgba(128,128,128,.4);font-size:12px;cursor:pointer}
.osd-chip-on{background:rgba(59,130,246,.2);border-color:rgba(59,130,246,.5)}
.osd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.osd-device-card{border:1px solid rgba(128,128,128,.35);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px}
.osd-device-selected{border-color:rgba(59,130,246,.6);background:rgba(59,130,246,.08)}
/* 文件选择弹窗 */
.osd-pick-row{display:flex;gap:6px;align-items:center}
.osd-pick-path{font:inherit;padding:6px 8px;border:1px solid rgba(128,128,128,.4);border-radius:6px;background:transparent;min-width:220px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}
.osd-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}
.osd-modal{background:rgba(60,60,60,.92);backdrop-filter:blur(10px);border:1px solid rgba(128,128,128,.5);border-radius:12px;padding:14px 16px;width:min(720px,92vw);max-height:82vh;display:flex;flex-direction:column;gap:10px;color:inherit;box-shadow:0 12px 40px rgba(0,0,0,.4)}
.osd-modal-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;font-weight:700}
.osd-modal-crumbs{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:12px}
.osd-crumb{padding:2px 8px;border-radius:6px;border:1px solid rgba(128,128,128,.4);cursor:pointer}
.osd-crumb:hover{background:rgba(128,128,128,.2)}
.osd-crumb-cur{background:rgba(59,130,246,.15);font-weight:600}
.osd-modal-list{flex:1;min-height:200px;max-height:46vh;overflow:auto;border:1px solid rgba(128,128,128,.3);border-radius:8px;padding:4px}
.osd-filerow{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:13px}
.osd-filerow:hover{background:rgba(128,128,128,.15)}
.osd-filerow-selected{background:rgba(59,130,246,.25)}
.osd-filerow-icon{width:18px;text-align:center;flex:none}
.osd-filerow-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.osd-filerow-size{flex:none;opacity:.6;font-size:11px}
.osd-modal-foot{display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.osd-link{font-size:12px;opacity:.7;cursor:pointer;text-decoration:underline}
.osd-link:hover{opacity:1}
`

export async function apply(ctx: any) {
  // 先挂载本包的 Remote 贡献（提供 remote.osDeploy 命名空间），再注册 UI。
  await ctx.remote.$mount(TYPERT_REMOTE)

  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  })

  const h = React.createElement
  // 注意：不能用 ctx.remote.osDeploy —— 属性链经 cordis 代理按
  // reflect.props['remote.osDeploy'] 解析服务，要求在 inject 中声明；
  // 而本插件自挂载该命名空间，注入会死锁。ctx.get() 是无注入门禁的
  // 可选查找（strict 模式确保提供方 fiber 已激活）。
  const remote = ctx.get('remote.osDeploy')

  function fmt(ts: number | null | undefined) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString() } catch (e) { return String(ts) }
  }

  // dsh-api-gateway 客户端的 invoke 把每次 Remote 调用解析为 Answer 信封：
  //   { ok: true, value: <方法返回值> } | { ok: false, error: RemoteError }
  // 拆包后再交给 UI——内层 {ok,...} 才是各方法自己的业务语义。
  function unwrap<T = any>(a: any): T {
    if (a && a.ok) return a.value as T
    throw new Error(a?.error?.message || a?.error?.code || String(a?.error ?? '调用失败'))
  }

  function btn(label: string, onClick: (e?: any) => void, cls?: string, disabled?: boolean) {
    return h('button', { className: 'osd-btn' + (cls ? ' ' + cls : ''), onClick, disabled: !!disabled }, label)
  }

  function field(label: string, value: string, onChange: (v: string) => void, placeholder?: string, type?: string) {
    return h('label', { className: 'osd-field' },
      h('span', { className: 'osd-meta' }, label),
      h('input', { className: 'osd-input', value: value || '', placeholder: placeholder || '', type: type || 'text', onChange: (e: any) => onChange(e.target.value) })
    )
  }

  function selectField(label: string, value: string, options: { value: string; label: string }[], onChange: (v: string) => void) {
    return h('label', { className: 'osd-field' },
      h('span', { className: 'osd-meta' }, label),
      h('select', { className: 'osd-select', value: value || '', onChange: (e: any) => onChange(e.target.value) },
        options.map(o => h('option', { key: o.value, value: o.value }, o.label))
      )
    )
  }

  function App() {
    const [tab, setTab] = React.useState<'tasks' | 'images' | 'create'>('tasks')
    const [images, setImages] = React.useState<any[]>([])
    const [tasks, setTasks] = React.useState<any[]>([])
    const [servers, setServers] = React.useState<any[]>([])
    const [error, setError] = React.useState('')
    const [msg, setMsg] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null)
    // 部署服务运行态（默认不启动，由面板按钮按需拉起）
    const [svc, setSvc] = React.useState<any>({ running: false, port: 0, imageCount: 0, taskCount: 0 })
    const [svcBusy, setSvcBusy] = React.useState(false)

    // Create task form state
    const [form, setForm] = React.useState<any>({
      imageId: '', vendor: '', components: ['core'],
      // Manual device input
      bmcHost: '', bmcUser: 'Administrator', bmcPassword: '',
      nicMac: '', hostname: '', osIp: '', osGateway: '', osPrefixLen: '24',
      osDns: '114.114.114.114', rootPassword: '', diskSn: '',
      // From server-manager
      useServerManager: false, selectedServerIds: [] as string[],
    })
    const [components, setComponents] = React.useState<any[]>([])
    const [probeResult, setProbeResult] = React.useState<any>(null)

    // Poll for updates
    React.useEffect(() => {
      let alive = true
      async function run() {
        try {
          const st = unwrap(await remote.serviceStatus())
          if (alive) setSvc(st || { running: false })
          const [img, tsk, srv] = await Promise.all([
            remote.listImages(), remote.listTasks(), remote.listServers(),
          ])
          if (alive) {
            setImages(unwrap(img).images || [])
            setTasks(unwrap(tsk).tasks || [])
            setServers(unwrap(srv).servers || [])
            setError('')
          }
        } catch (e: any) { if (alive) setError(String(e?.message || e)) }
      }
      run()
      const timer = setInterval(run, 5000)
      return () => { alive = false; clearInterval(timer) }
    }, [])

    // Load components when vendor changes
    React.useEffect(() => {
      if (!form.vendor) { setComponents([]); return }
      remote.listComponents({ vendor: form.vendor })
        .then((r: any) => setComponents(unwrap(r).components || []))
        .catch(() => setComponents([]))
    }, [form.vendor])

    function setF(k: string) { return (v: string) => setForm((f: any) => ({ ...f, [k]: v })) }

    // ---------- ISO 文件选择弹窗 ----------
    const [fileBrowser, setFileBrowser] = React.useState<{
      open: boolean; path: string; parent: string | null; entries: any[];
      roots: string[]; loading: boolean; error: string; selected: string | null; truncated: boolean;
    }>({ open: false, path: '', parent: null, entries: [], roots: [], loading: false, error: '', selected: null, truncated: false })
    const [isoFilterOnly, setIsoFilterOnly] = React.useState(true)
    const [manualIsoInput, setManualIsoInput] = React.useState(false)

    async function fbLoad(p: string | null) {
      setFileBrowser((s: any) => ({ ...s, loading: true, error: '', selected: null }))
      try {
        const r = unwrap(await remote.browsePath({ path: p || null }))
        setFileBrowser((s: any) => ({
          ...s, open: true, path: r.path, parent: r.parent, entries: r.entries || [],
          roots: r.roots || [], loading: false, error: r.error || '', truncated: !!r.truncated,
        }))
      } catch (e: any) {
        setFileBrowser((s: any) => ({ ...s, loading: false, error: String(e?.message || e) }))
      }
    }
    function fbOpen() { fbLoad(null) }
    function fbClose() { setFileBrowser((s: any) => ({ ...s, open: false })) }
    function fbConfirm() {
      const sel = fileBrowser.selected
      if (!sel) return
      setForm((f: any) => {
        const base = sel.split(/[\\/]/).pop() || sel
        const name = base.replace(/\.iso$/i, '')
        return { ...f, isoPath: sel, isoName: f.isoName || name }
      })
      fbClose()
    }

    async function doRegisterIso() {
      setBusy(true); setMsg('')
      try {
        const r = unwrap(await remote.registerIso({ name: form.isoName || '', vendor: form.vendor, isoPath: form.isoPath }))
        setMsg(r.ok ? '镜像注册成功' : `注册失败: ${r.error}`)
        if (r.ok) { setForm((f: any) => ({ ...f, isoPath: '', isoName: '' })) }
      } catch (e: any) { setMsg('注册失败: ' + String(e?.message || e)) }
      finally { setBusy(false) }
    }

    async function doExtract(imgId: string) {
      setBusy(true); setMsg('')
      try {
        const r = unwrap(await remote.extractImage({ imageId: imgId }))
        setMsg(r.ok ? '解包完成' : `解包失败: ${r.error}`)
      } catch (e: any) { setMsg('解包失败: ' + String(e?.message || e)) }
      finally { setBusy(false) }
    }

    async function doDeleteImage(imgId: string) {
      try { const r = unwrap(await remote.deleteImage({ imageId: imgId })); setMsg(r.ok ? '已删除' : `删除失败: ${r.error}`) }
      catch (e: any) { setMsg('删除失败: ' + String(e?.message || e)) }
    }

    async function doProbe() {
      setBusy(true); setProbeResult(null); setMsg('')
      try {
        const r = unwrap(await remote.probeDevice({ bmcHost: form.bmcHost, bmcUser: form.bmcUser, bmcPassword: form.bmcPassword }))
        setProbeResult(r)
        if (r.ok && r.nicMac) setForm((f: any) => ({ ...f, nicMac: r.nicMac }))
        if (r.ok && r.disks && r.disks.length === 1) setForm((f: any) => ({ ...f, diskSn: r.disks[0].serial }))
      } catch (e: any) { setProbeResult({ ok: false, error: String(e?.message || e) }) }
      finally { setBusy(false) }
    }

    async function doCreateTask() {
      setBusy(true); setMsg('')
      try {
        let devices: any[] = []
        if (form.useServerManager && form.selectedServerIds.length > 0) {
          // Build from selected server-manager servers
          for (const sid of form.selectedServerIds) {
            const srv = servers.find((s: any) => s.id === sid)
            if (!srv) continue
            devices.push({
              id: srv.id, bmcHost: srv.bmcHost || form.bmcHost,
              bmcUser: srv.bmcUser || form.bmcUser, bmcPassword: form.bmcPassword,
              nicMac: form.nicMac, hostname: form.hostname || srv.name,
              osIp: form.osIp, osGateway: form.osGateway, osPrefixLen: parseInt(form.osPrefixLen) || 24,
              osDns: form.osDns.split(',').map((s: string) => s.trim()).filter(Boolean),
              rootPassword: form.rootPassword, diskSn: form.diskSn,
              sshUser: srv.sshUser, label: srv.name,
            })
          }
        } else {
          // Manual input
          devices.push({
            id: 'manual_' + Date.now(), bmcHost: form.bmcHost,
            bmcUser: form.bmcUser, bmcPassword: form.bmcPassword,
            nicMac: form.nicMac, hostname: form.hostname,
            osIp: form.osIp, osGateway: form.osGateway, osPrefixLen: parseInt(form.osPrefixLen) || 24,
            osDns: form.osDns.split(',').map((s: string) => s.trim()).filter(Boolean),
            rootPassword: form.rootPassword, diskSn: form.diskSn,
            label: form.hostname || form.bmcHost,
          })
        }
        if (devices.length === 0) { setMsg('请至少添加一个设备'); return }
        const r = unwrap(await remote.createTask({ imageId: form.imageId, devices, components: form.components }))
        setMsg(r.ok ? `已创建 ${r.taskIds.length} 个安装任务` : `创建失败: ${r.error}`)
        if (r.ok) { setTab('tasks') }
      } catch (e: any) { setMsg('创建失败: ' + String(e?.message || e)) }
      finally { setBusy(false) }
    }

    async function doCancelTask(id: string) {
      try { unwrap(await remote.cancelTask({ taskId: id })) } catch (e: any) { setMsg('取消失败: ' + String(e?.message || e)) }
    }

    async function doDeleteTask(id: string) {
      try { unwrap(await remote.deleteTask({ taskId: id })) } catch (e: any) { setMsg('删除失败: ' + String(e?.message || e)) }
    }

    // ---------- 部署服务控制 ----------
    async function doSvcStart() {
      setSvcBusy(true); setMsg('')
      try {
        const r = unwrap(await remote.serviceStart())
        if (r.ok) { setSvc(r.status || { running: false }); setMsg('部署服务已启动（HTTP 软件源 + 任务队列）') }
        else setMsg('启动失败: ' + (r.error || '未知错误'))
      } catch (e: any) { setMsg('启动失败: ' + String(e?.message || e)) }
      finally { setSvcBusy(false) }
    }
    async function doSvcStop() {
      setSvcBusy(true); setMsg('')
      try {
        const r = unwrap(await remote.serviceStop())
        if (r.ok) { setSvc(r.status || { running: false }); setMsg('部署服务已停止（排队/运行中的任务将终止）') }
        else setMsg('停止失败: ' + (r.error || '未知错误'))
      } catch (e: any) { setMsg('停止失败: ' + String(e?.message || e)) }
      finally { setSvcBusy(false) }
    }
    async function doSvcRestart() {
      setSvcBusy(true); setMsg('')
      try {
        const r = unwrap(await remote.serviceRestart())
        if (r.ok) { setSvc(r.status || { running: false }); setMsg('部署服务已重启') }
        else setMsg('重启失败: ' + (r.error || '未知错误'))
      } catch (e: any) { setMsg('重启失败: ' + String(e?.message || e)) }
      finally { setSvcBusy(false) }
    }

    const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null

    return h('div', { className: 'osd-wrap' },
      // 服务控制条：部署服务默认不启动，按需拉起/停止/重启
      h('div', { className: 'osd-card' },
        h('div', { className: 'osd-row' },
          h('span', { className: 'osd-dot ' + (svc.running ? 'osd-running' : 'osd-off') }),
          h('span', { className: 'osd-name' }, svc.running ? '部署服务运行中' : '部署服务已停止'),
          svc.running
            ? h('span', { className: 'osd-meta' }, `端口 ${svc.port} · 启动于 ${fmt(svc.startedAt)} · 镜像 ${svc.imageCount} · 任务 ${svc.taskCount}`)
            : h('span', { className: 'osd-meta' }, '不影响 DSH 启动速度'),
          btn('启动', doSvcStart, 'osd-btn-primary', svcBusy || svc.running),
          btn('停止', doSvcStop, 'osd-btn-danger', svcBusy || !svc.running),
          btn('重启', doSvcRestart, '', svcBusy || !svc.running),
          svcBusy && h('span', { className: 'osd-meta' }, '处理中...'),
        ),
        !svc.running && h('span', { className: 'osd-meta' },
          '部署服务默认不启动：点击「启动」后才会开启 HTTP 软件源与安装任务队列；创建安装任务需先启动服务。'),
      ),

      // Tabs
      h('div', { className: 'osd-tabs' },
        h('div', { className: 'osd-tab' + (tab === 'tasks' ? ' osd-tab-active' : ''), onClick: () => setTab('tasks') }, `安装任务 (${tasks.length})`),
        h('div', { className: 'osd-tab' + (tab === 'images' ? ' osd-tab-active' : ''), onClick: () => setTab('images') }, `镜像管理 (${images.length})`),
        h('div', { className: 'osd-tab' + (tab === 'create' ? ' osd-tab-active' : ''), onClick: () => setTab('create') }, '创建安装任务'),
      ),

      error && h('div', { style: { color: '#e5484d', fontSize: 12 } }, error),
      msg && h('div', { style: { color: '#30a46c', fontSize: 12 } }, msg),

      // ===== Tasks Tab =====
      tab === 'tasks' && h(React.Fragment, null,
        h('div', { className: 'osd-bar' },
          btn('刷新', () => setMsg('')), h('span', { className: 'osd-meta' }, '每 5 秒自动刷新'),
        ),
        tasks.length === 0 && h('div', { className: 'osd-card' }, h('span', { className: 'osd-meta' }, '暂无安装任务。点击「创建安装任务」开始。')),
        h('div', { className: 'osd-grid' },
          tasks.map((t: any) => h('div', {
            key: t.id,
            className: 'osd-device-card' + (selectedTaskId === t.id ? ' osd-device-selected' : ''),
            onClick: () => setSelectedTaskId(selectedTaskId === t.id ? null : t.id),
          },
            h('div', { className: 'osd-row' },
              h('span', { className: `osd-dot osd-${t.status}` }),
              h('span', { className: 'osd-name' }, t.device?.hostname || t.device?.bmcHost || 'unknown'),
              h('span', { className: 'osd-badge' }, t.status),
            ),
            h('div', { className: 'osd-kv' }, `BMC: ${t.device?.bmcHost} → OS: ${t.device?.osIp}`),
            h('div', { className: 'osd-kv' }, `阶段: ${t.stage} · 进度: ${t.progress}%`),
            h('div', { className: 'osd-progress' },
              h('div', { className: `osd-progress-bar osd-progress-${t.status}`, style: { width: `${t.progress}%` } }),
            ),
            h('div', { className: 'osd-kv' }, `创建: ${fmt(t.createdAt)}${t.finishedAt ? ' · 完成: ' + fmt(t.finishedAt) : ''}`),
            t.error && h('div', { style: { color: '#e5484d', fontSize: 12 } }, t.error),
            h('div', { className: 'osd-row' },
              (t.status === 'running' || t.status === 'queued') && btn('取消', (e: any) => { e.stopPropagation(); doCancelTask(t.id) }, 'osd-btn-danger'),
              (t.status === 'success' || t.status === 'failed' || t.status === 'cancelled') && btn('删除', (e: any) => { e.stopPropagation(); doDeleteTask(t.id) }, 'osd-btn-danger'),
            ),
          )),
        ),
        // Task detail (logs)
        selectedTask && h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, `任务详情: ${selectedTask.device?.hostname || selectedTask.device?.bmcHost}`),
          h('div', { className: 'osd-kv' },
            `镜像: ${images.find(i => i.id === selectedTask.imageId)?.name || selectedTask.imageId} · `,
            `组件: ${selectedTask.components?.join(', ')} · `,
            `BMC: ${selectedTask.device?.bmcHost} · `,
            `目标 IP: ${selectedTask.device?.osIp}`,
          ),
          selectedTask.device?.diskSn && h('div', { className: 'osd-kv' }, `目标磁盘 SN: ${selectedTask.device.diskSn}`),
          h('div', { className: 'osd-h' }, '安装日志（实时）'),
          h('div', { className: 'osd-log' },
            (selectedTask.logs || []).map((l: any, i: number) =>
              h('div', { key: i, className: `osd-log-${l.level}` },
                `[${new Date(l.ts).toLocaleTimeString()}] ${l.msg}`)
            ),
            selectedTask.status === 'running' && h('div', { className: 'osd-log-info' }, '— 等待更多日志... —'),
          ),
        ),
      ),

      // ===== Images Tab =====
      tab === 'images' && h(React.Fragment, null,
        h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, '注册新镜像'),
          h('div', { className: 'osd-row' },
            field('镜像名称', form.isoName || '', setF('isoName'), '如 openEuler-22.03-SP4'),
            selectField('厂家', form.vendor, [
              { value: '', label: '— 选择 —' },
              { value: 'openEuler', label: 'openEuler' },
              { value: 'kylin', label: '麒麟 V10' },
              { value: 'debian', label: 'Debian' },
            ], setF('vendor')),
          ),
          h('div', { className: 'osd-row' },
            h('label', { className: 'osd-field' },
              h('span', { className: 'osd-meta' }, 'ISO 文件'),
              h('div', { className: 'osd-pick-row' },
                h('span', { className: 'osd-pick-path', title: form.isoPath || '' }, form.isoPath || '（未选择文件）'),
                btn('浏览…', fbOpen, '', busy),
                h('span', { className: 'osd-link', onClick: () => setManualIsoInput(!manualIsoInput) }, manualIsoInput ? '收起手动输入' : '手动输入路径'),
              ),
            ),
            manualIsoInput && field('ISO 文件路径', form.isoPath || '', setF('isoPath'), 'E:\\path\\to\\image.iso'),
            btn('注册', doRegisterIso, 'osd-btn-primary', busy || !form.isoPath || !form.vendor),
          ),
        ),
        h('div', { className: 'osd-h' }, `已注册镜像 (${images.length})`),
        images.map((img: any) => h('div', { key: img.id, className: 'osd-card' },
          h('div', { className: 'osd-row' },
            h('span', { className: 'osd-name' }, img.name),
            h('span', { className: 'osd-badge' }, img.vendor),
            img.extracted ? h('span', { className: 'osd-badge', style: { color: '#30a46c' } }, '已解包') : h('span', { className: 'osd-badge' }, '未解包'),
          ),
          h('div', { className: 'osd-kv' }, `路径: ${img.isoPath}`),
          h('div', { className: 'osd-kv' }, `大小: ${(img.sizeBytes / 1073741824).toFixed(2)} GB · 注册: ${fmt(img.registeredAt)}`),
          h('div', { className: 'osd-row' },
            !img.extracted && btn('解包', () => doExtract(img.id), 'osd-btn-primary', busy),
            btn('删除', () => doDeleteImage(img.id), 'osd-btn-danger'),
          ),
        )),
      ),

      // ===== Create Task Tab =====
      tab === 'create' && h(React.Fragment, null,
        // Select image
        h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, '1. 选择镜像'),
          selectField('安装镜像', form.imageId,
            [{ value: '', label: images.length === 0 ? '请先注册镜像' : '— 选择 —' },
              ...images.filter(i => i.extracted).map(i => ({ value: i.id, label: `${i.name} (${i.vendor})` }))],
            setF('imageId')),
        ),
        // Select components
        form.imageId && h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, '2. 安装组件'),
          h('div', { className: 'osd-row' },
            components.map(c => h('div', {
              key: c.id,
              className: 'osd-chip' + (form.components.includes(c.id) ? ' osd-chip-on' : ''),
              onClick: () => setForm((f: any) => ({
                ...f,
                components: f.components.includes(c.id)
                  ? f.components.filter((x: string) => x !== c.id)
                  : [...f.components, c.id],
              })),
            }, c.name)),
          ),
          h('div', { className: 'osd-meta' }, components.filter(c => form.components.includes(c.id)).map(c => c.description).join(' · ')),
        ),
        // Device config
        h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, '3. 设备信息'),
          servers.length > 0 && h('div', { className: 'osd-row' },
            h('label', { className: 'osd-chip' + (form.useServerManager ? ' osd-chip-on' : '') },
              h('input', { type: 'checkbox', checked: form.useServerManager, onChange: (e: any) => setForm((f: any) => ({ ...f, useServerManager: e.target.checked })) }),
              ' 从服务器管理选择',
            ),
          ),
          form.useServerManager ? h('div', { className: 'osd-grid' },
            servers.map((s: any) => h('div', {
              key: s.id,
              className: 'osd-device-card' + (form.selectedServerIds.includes(s.id) ? ' osd-device-selected' : ''),
              onClick: () => setForm((f: any) => ({
                ...f,
                selectedServerIds: f.selectedServerIds.includes(s.id)
                  ? f.selectedServerIds.filter((x: string) => x !== s.id)
                  : [...f.selectedServerIds, s.id],
              })),
            },
              h('span', { className: 'osd-name' }, s.name),
              h('span', { className: 'osd-kv' }, `SSH: ${s.host} · BMC: ${s.bmcHost || 'N/A'}`),
            )),
          ) : h(React.Fragment, null,
            h('div', { className: 'osd-row' },
              field('BMC 地址', form.bmcHost, setF('bmcHost'), '192.168.1.10'),
              field('BMC 用户', form.bmcUser, setF('bmcUser'), 'Administrator'),
              field('BMC 密码', form.bmcPassword, setF('bmcPassword'), '', 'password'),
              btn('探测设备', doProbe, '', busy || !form.bmcHost || !form.bmcUser || !form.bmcPassword),
            ),
            probeResult && h('div', { className: 'osd-kv', style: { color: probeResult.ok ? '#30a46c' : '#e5484d' } },
              probeResult.ok ? `型号: ${probeResult.model} · SN: ${probeResult.serial} · 电源: ${probeResult.powerState} · NIC: ${probeResult.nicMac}` : `探测失败: ${probeResult.error}`,
            ),
            probeResult?.ok && probeResult.disks && probeResult.disks.length > 0 && h('div', { className: 'osd-kv' },
              '磁盘: ', probeResult.disks.map((d: any) => `${d.serial} (${(d.capacityBytes / 1e9).toFixed(0)}GB ${d.media})`).join(' | '),
            ),
          ),
        ),
        // OS config
        h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, '4. OS 配置'),
          h('div', { className: 'osd-row' },
            field('root 密码', form.rootPassword, setF('rootPassword'), '', 'password'),
            field('主机名', form.hostname, setF('hostname'), 'server-01'),
          ),
          h('div', { className: 'osd-row' },
            field('OS IP', form.osIp, setF('osIp'), '192.168.1.100'),
            field('网关', form.osGateway, setF('osGateway'), '192.168.1.1'),
            field('子网掩码位数', form.osPrefixLen, setF('osPrefixLen'), '24'),
            field('DNS', form.osDns, setF('osDns'), '114.114.114.114'),
          ),
          h('div', { className: 'osd-row' },
            field('业务网卡 MAC', form.nicMac, setF('nicMac'), 'aa:bb:cc:dd:ee:ff'),
            probeResult?.disks && probeResult.disks.length > 0 &&
            selectField('目标磁盘', form.diskSn,
              probeResult.disks.map((d: any) => ({ value: d.serial, label: `${d.serial} (${(d.capacityBytes / 1e9).toFixed(0)}GB)` })),
              setF('diskSn')),
          ),
          h('div', { className: 'osd-meta' }, '注意：安装会清空目标磁盘上的所有数据！'),
        ),
        // Submit
        h('div', { className: 'osd-row' },
          btn('创建安装任务', doCreateTask, 'osd-btn-primary', busy || !svc.running || !form.imageId || !form.rootPassword || (!form.useServerManager && !form.bmcHost)),
          !svc.running && h('span', { className: 'osd-meta', style: { color: '#f5c542' } }, '需先启动部署服务'),
          busy && h('span', { className: 'osd-meta' }, '处理中...'),
        ),
      ),

      // ===== ISO 文件选择弹窗 =====
      fileBrowser.open && h('div', { className: 'osd-modal-backdrop', onClick: fbClose },
        h('div', { className: 'osd-modal', onClick: (e: any) => e.stopPropagation() },
          h('div', { className: 'osd-modal-h' },
            h('span', null, '选择 ISO 镜像文件'),
            h('span', { className: 'osd-link', onClick: fbClose }, '✕ 关闭'),
          ),
          // 面包屑 + 上级 + 主目录
          h('div', { className: 'osd-modal-crumbs' },
            h('span', { className: 'osd-crumb', title: fileBrowser.path, onClick: () => fbLoad(null) }, '⌂ 主目录'),
            fileBrowser.parent && h('span', { className: 'osd-crumb', onClick: () => fbLoad(fileBrowser.parent) }, '⬆ 上级'),
            h('span', { className: 'osd-crumb osd-crumb-cur', title: fileBrowser.path }, fileBrowser.path || '…'),
            fileBrowser.truncated && h('span', { className: 'osd-meta' }, '（目录过大，仅显示前 2000 项）'),
          ),
          // win32 盘符切换
          fileBrowser.roots.length > 1 && h('div', { className: 'osd-modal-crumbs' },
            fileBrowser.roots.map((r: string) => h('span', {
              key: r, className: 'osd-crumb', onClick: () => fbLoad(r),
            }, r.endsWith('\\') ? r.slice(0, -1) : r)),
          ),
          // 过滤与提示
          h('div', { className: 'osd-row' },
            h('label', { className: 'osd-chip' + (isoFilterOnly ? ' osd-chip-on' : ''), onClick: () => setIsoFilterOnly(!isoFilterOnly) },
              '仅显示 .iso 文件'),
            fileBrowser.loading && h('span', { className: 'osd-meta' }, '加载中…'),
            fileBrowser.error && h('span', { className: 'osd-meta', style: { color: '#e5484d' } }, fileBrowser.error),
          ),
          // 文件列表：目录可进入，文件可选中
          h('div', { className: 'osd-modal-list' },
            fileBrowser.entries
              .filter((e: any) => e.isDir || !isoFilterOnly || /\.iso$/i.test(e.name))
              .map((e: any) => h('div', {
                key: e.path,
                className: 'osd-filerow' + (fileBrowser.selected === e.path ? ' osd-filerow-selected' : ''),
                onClick: () => { if (e.isDir) fbLoad(e.path); else setFileBrowser((s: any) => ({ ...s, selected: e.path })) },
                onDoubleClick: () => { if (!e.isDir) fbConfirm() },
              },
                h('span', { className: 'osd-filerow-icon' }, e.isDir ? '📁' : '📄'),
                h('span', { className: 'osd-filerow-name' }, e.name),
                !e.isDir && e.sizeBytes != null && h('span', { className: 'osd-filerow-size' }, `${(e.sizeBytes / 1073741824).toFixed(2)} GB`),
              )),
            !fileBrowser.loading && fileBrowser.entries
              .filter((e: any) => e.isDir || !isoFilterOnly || /\.iso$/i.test(e.name)).length === 0
              && h('div', { className: 'osd-meta', style: { padding: '8px' } }, '此目录没有 .iso 文件（可切换显示全部文件）'),
          ),
          h('div', { className: 'osd-modal-foot' },
            h('span', { className: 'osd-meta', style: { marginRight: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '50%' },
              title: fileBrowser.selected || '' }, fileBrowser.selected ? `已选: ${fileBrowser.selected.split(/[\\/]/).pop()}` : '未选择文件'),
            btn('取消', fbClose),
            btn('选择此文件', fbConfirm, 'osd-btn-primary', !fileBrowser.selected),
          ),
        ),
      ),
    )
  }

  // 错误边界：本面板任何渲染异常只降级为错误卡片，绝不白屏整个 GUI
  // （React 无边界时异常会卸载整棵树）。
  class Boundary extends React.Component<any, { error: any }> {
    state = { error: null as any }
    static getDerivedStateFromError(error: any) { return { error } }
    render() {
      if (this.state.error) {
        return h('div', { className: 'osd-card' },
          h('div', { className: 'osd-h' }, 'OS 部署面板渲染出错'),
          h('div', { className: 'osd-pre' }, String(this.state.error?.message || this.state.error)),
          h('div', { className: 'osd-row' },
            h('button', { className: 'osd-btn', onClick: () => this.setState({ error: null }) }, '重试'),
          ),
        )
      }
      return this.props.children as any
    }
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register(
    { name: 'settings.section', id: 'os-deploy', order: 51, label: 'OS 部署' },
    () => h(Boundary, null, h(App)),
  ))
}
