// client.js 挂载流程冒烟测试（Node 模拟浏览器环境）
const registered = [];
globalThis.window = globalThis;
globalThis.__ModuleLoader__ = { load: (m) => registered.push(m) };
require('./lib/client.js');
const m = registered[0];
console.log('注册 id:', m?.id);
const out = m.factory((name) => {
  if (name === 'react') return { createElement: () => null, Fragment: [] };
  if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null, Fragment: [] };
  if (name === '@deepseek-ai/cordis') return { Context: class {}, Service: class {} };
  throw new Error('意外的 require: ' + name);
});
console.log('factory 导出:', Object.keys(out).join(','));
console.log('inject:', JSON.stringify(out.inject));
console.log('apply 是异步函数:', out.apply.constructor.name === 'AsyncFunction');
let mounted = null;
const fakeCtx = {
  effect: () => () => {},
  remote: {
    $mount: async (c) => { mounted = c; return async () => {}; },
    osDeploy: { serviceStatus: async () => ({ running: false }) },
  },
  slots: { inject: () => {}, register: () => () => {} },
};
out.apply(fakeCtx).then(() => {
  console.log('挂载的包名:', mounted?.package);
  console.log('描述符数量:', mounted?.descriptors?.length);
  const d = mounted?.descriptors?.[0];
  console.log('首个描述符:', d?.namespace + '/' + d?.method, '| kind:', d?.invocation?.kind);
}).catch(e => { console.error('APPLY FAIL:', e.message); process.exit(1); });
