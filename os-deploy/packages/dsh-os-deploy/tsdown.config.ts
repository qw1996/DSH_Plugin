import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

/**
 * Host 半：ESM node bundle（@Remote 装饰器经 typertPlugin transform 降级为
 * __esDecorate），并生成 lib/typert.host.js（TYPERT 清单）与
 * lib/typert.remote-client.js（client 侧贡献）。
 *
 * 注意：client 半的构建（tsdown.client.config.ts）会内联生成的
 * lib/typert.remote-client.js，因此必须先跑本配置（见 package.json 的
 * bundle 脚本：tsdown && tsdown --config tsdown.client.config.ts）。
 */
export default defineConfig({
  name: '@qinwei/dsh-os-deploy',
  entry: {
    index: 'src/index.ts',
    engine: 'src/engine.ts',
    'types/types': 'src/types.ts',
  },
  format: ['esm'],
  platform: 'node',
  outDir: 'lib',
  dts: true,
  clean: true,
  fixedExtension: false,
  plugins: [typertPlugin({ mode: 'package' })],
})
