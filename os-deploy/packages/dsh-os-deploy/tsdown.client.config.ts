import { defineConfig } from 'tsdown'

/**
 * 浏览器壳层冻结模块表（dsh-web-frontend staticModules）。
 * client bundle 中这些依赖保持 external，运行时由 loader 注入的 require 解析；
 * 其余依赖一律内联（模块表无法应答的 require 会在运行时抛错）。
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/**
 * Client 半：CJS 浏览器 bundle，包装为 window.__ModuleLoader__.load({id, factory})。
 * 客户端 bundle 由 /plugins 拼接成经典脚本执行——ESM 的 import/export 会令
 * 整个拼接 bundle 语法错误、所有插件客户端全部无法注册（启动失败）。
 *
 * src/client.ts 通过包自引用导入 ./lib/typert.remote-client.js（由 host 构建
 * 先生成），这里连同 zod 一起内联进浏览器 bundle，并在 apply 中
 * ctx.remote.$mount(TYPERT_REMOTE) 自行挂载（第三方包的 Remote 贡献不会被
 * dsh-api-remotes 装配）。
 */
export default defineConfig({
  name: '@qinwei/dsh-os-deploy/client',
  entry: { client: 'src/client.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: false,
  clean: false,
  external: [...PLATFORM_MODULES],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@qinwei/dsh-os-deploy", factory: (require) => {',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
})
