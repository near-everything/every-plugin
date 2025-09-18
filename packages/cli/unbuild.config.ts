import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    {
      input: './src/index.ts',
      outDir: './dist',
      name: 'index',
      format: 'esm',
      ext: 'mjs'
    }
  ],
  declaration: false,
  clean: true,
  rollup: {
    emitCJS: false,
    inlineDependencies: true,
    esbuild: {
      target: 'node18',
      minify: false
    }
  },
  hooks: {
    'build:done': async (ctx) => {
      // Make the output executable
      const fs = await import('fs')
      const path = await import('path')
      const outputFile = path.join(ctx.options.outDir, 'index.mjs')
      
      if (fs.existsSync(outputFile)) {
        // Add shebang to make it executable
        const content = fs.readFileSync(outputFile, 'utf8')
        const withShebang = `#!/usr/bin/env node\n${content}`
        fs.writeFileSync(outputFile, withShebang)
        
        // Make file executable
        fs.chmodSync(outputFile, '755')
      }
    }
  }
})
