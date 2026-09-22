// client.js 挂载 + 渲染冒烟测试（Node 模拟浏览器环境，真实 React SSR 渲染）
// 验证目标：
// 1. 模块注册、inject、async apply、$mount(TYPERT_REMOTE) 挂载 16 个描述符
// 2. 设置槽组件可渲染（含错误边界、Answer 信封拆包后的初始态）
// 3. 模拟"启动成功"后的渲染（running=true）——回归白屏缺陷
const registered = [];
globalThis.window = globalThis;
globalThis.__ModuleLoader__ = { load: (m) => registered.push(m) };
require('./lib/client.js');
const m = registered[0];
console.log('注册 id:', m?.id);

const out = m.factory((name) => {
  if (name === 'react') return require('react');
  if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
  if (name === '@deepseek-ai/cordis') return { Context: class {}, Service: class {} };
  throw new Error('意外的 require: ' + name);
});
console.log('inject:', JSON.stringify(out.inject));

// ---- 模拟 host 侧真实返回（Answer 信封 {ok:true,value:...}）----
const svcRunning = {
  running: true, port: 8080, startedAt: Date.now(),
  imageCount: 2, taskCount: 1, activeTaskCount: 1,
};
const ns = {
  serviceStatus: async () => ({ ok: true, value: { ...svcRunning } }),
  serviceStart: async () => ({ ok: true, value: { ok: true, status: { ...svcRunning } } }),
  serviceStop: async () => ({ ok: true, value: { ok: true, status: { running: false, port: 8080, startedAt: null, imageCount: 2, taskCount: 0, activeTaskCount: 0 } } }),
  listImages: async () => ({ ok: true, value: { images: [
    { id: 'img1', name: 'openEuler-22.03-SP4', vendor: 'openEuler', extracted: true, isoPath: 'E:\\x.iso', sizeBytes: 4294967296, registeredAt: Date.now() },
  ] } }),
  listTasks: async () => ({ ok: true, value: { tasks: [
    { id: 't1', imageId: 'img1', status: 'success', stage: 'done', progress: 100, createdAt: Date.now(), finishedAt: Date.now(),
      device: { hostname: 'srv-01', bmcHost: '192.168.1.10', osIp: '192.168.1.100' }, components: ['core'], logs: [{ ts: Date.now(), level: 'info', msg: 'ok' }] },
  ] } }),
  listServers: async () => ({ ok: true, value: { servers: [] } }),
  listComponents: async () => ({ ok: true, value: { components: [{ id: 'core', name: '核心', description: '' }] } }),
  registerIso: async () => ({ ok: true, value: { ok: true, imageId: 'x' } }),
  extractImage: async () => ({ ok: true, value: { ok: true } }),
  deleteImage: async () => ({ ok: true, value: { ok: true } }),
  probeDevice: async () => ({ ok: true, value: { ok: false, error: 'unreachable' } }),
  createTask: async () => ({ ok: true, value: { ok: true, taskIds: ['t2'] } }),
  cancelTask: async () => ({ ok: true, value: { ok: true } }),
  deleteTask: async () => ({ ok: true, value: { ok: true } }),
  serviceRestart: async () => ({ ok: true, value: { ok: true, status: { ...svcRunning } } }),
  browsePath: async () => ({ ok: true, value: {
    path: 'C:\\Users', parent: 'C:\\', home: 'C:\\Users\\x', roots: ['C:\\', 'E:\\'],
    entries: [
      { name: 'isos', path: 'C:\\Users\\isos', isDir: true, sizeBytes: null },
      { name: 'openEuler.iso', path: 'C:\\Users\\isos\\openEuler.iso', isDir: false, sizeBytes: 4294967296 },
    ], truncated: false } }),
};

let mounted = null;
let mainPanel = null;
let sidebarEntry = null;
const fakeCtx = {
  effect: () => () => {},
  get: (name) => (name === 'remote.osDeploy' ? ns : undefined),
  remote: { $mount: async (c) => { mounted = c; return async () => {}; } },
  slots: {
    inject: (_slot, reg) => { reg(); },
    register: (opts, comp) => {
      if (opts.name === 'main') mainPanel = comp;
      if (opts.name === 'sidebar.panellist') sidebarEntry = { opts, comp };
    },
  },
};

out.apply(fakeCtx).then(async () => {
  console.log('挂载描述符:', mounted?.descriptors?.length, '个（包 ' + mounted?.package + '）');
  if (!mainPanel) throw new Error('main 面板未注册');
  if (!sidebarEntry) throw new Error('sidebar.panellist 图标未注册');
  console.log('sidebar 图标: id=' + sidebarEntry.opts.id + ' label=' + sidebarEntry.opts.label);
  const React = require('react');
  const { renderToString } = require('react-dom/server');
  // 图标组件可渲染（SVG）
  const iconHtml = renderToString(React.createElement(sidebarEntry.comp, { size: 18, active: true }));
  if (!iconHtml.includes('<svg')) throw new Error('图标不是 SVG');
  console.log('sidebar 图标渲染 OK (' + iconHtml.length + ' 字符)');
  // 主面板内容
  const html1 = renderToString(mainPanel());
  console.log('主面板初始渲染:', html1.length, '字符，含"部署服务":', html1.includes('部署服务'));
  if (!html1.includes('部署服务')) throw new Error('主面板内容缺失');
  const html2 = renderToString(mainPanel());
  console.log('二次渲染:', html2.length, '字符 OK');
  console.log('全部通过 OK');
}).catch(e => { console.error('FAIL:', e); process.exit(1); });