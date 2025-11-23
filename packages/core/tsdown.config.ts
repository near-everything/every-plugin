import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/effect.ts',
    'src/zod.ts',
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
  treeshake: true,        // Enable tree-shaking for consumers
  sourcemap: true,        // External .map files for better IDE support
  minify: false          // Keep readable for debugging
})
