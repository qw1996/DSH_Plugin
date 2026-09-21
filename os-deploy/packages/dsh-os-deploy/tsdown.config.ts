import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

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

export default defineConfig([
  // Host 半：ESM node bundle（@Remote 装饰器经 typertPlugin transform 降级为 __esDecorate）
  {
    name: '@qinwei/dsh-os-deploy',
    entry: {
      index: 'src/index.ts',
      'types/types': 'src/types.ts',
    },
    format: ['esm'],
    platform: 'node',
    outDir: 'lib',
    dts: true,
    clean: true,
    fixedExtension: false,
    plugins: [typertPlugin({ mode: 'package' })],
  },
  // Client 半：CJS 浏览器 bundle，包装为 window.__ModuleLoader__.load({id, factory})。
  // 客户端 bundle 由 /plugins 拼接成经典脚本执行——ESM 的 import/export 会令
  // 整个拼接 bundle 语法错误、所有插件客户端全部无法注册（启动失败）。
  {
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
  },
])
