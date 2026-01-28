import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/effect.ts',
    'src/zod.ts',
    'src/zod-core.ts',
    'src/orpc.ts',
    'src/errors.ts',
    'src/runtime/index.ts',
    'src/testing/index.ts',
    'src/runtime/services/normalize.ts',
    'src/build/rspack/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  outDir: 'dist',
  treeshake: true,
  sourcemap: true,
  minify: false,
  unbundle: true,
  external: [
    'effect',
    'zod',
    /^@orpc\/.*/,
    /^@module-federation\/.*/,
  ]
})
