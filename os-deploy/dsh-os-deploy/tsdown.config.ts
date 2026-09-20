import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    'types/types': 'src/types.ts',
  },
  format: ['esm'],
  outDir: 'lib',
  dts: true,
  clean: true,
  fixedExtension: false,
})
