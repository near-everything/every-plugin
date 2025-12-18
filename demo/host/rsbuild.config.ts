import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { withZephyr } from 'zephyr-rsbuild-plugin';
import fs from 'node:fs';
import path from 'node:path';
import pkg from './package.json';

const __dirname = import.meta.dirname;
const isProduction = process.env.NODE_ENV === 'production';

const configPath = process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, '../bos.config.json');
const bosConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function updateBosConfig(hostUrl: string) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.app.host.production = hostUrl;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('   ✅ Updated bos.config.json');
  } catch (err) {
    console.error(
      '   ❌ Failed to update bos.config.json:',
      (err as Error).message
    );
  }
}

const plugins = [
  pluginReact(),
  pluginModuleFederation({
    name: 'host',
    remotes: {},
    dts: false,
    shared: {
      react: {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies.react,
      },
      'react-dom': {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies['react-dom'],
      },
      '@tanstack/react-query': {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies['@tanstack/react-query'],
      },
      '@tanstack/react-router': {
        singleton: true,
        eager: true,
        requiredVersion: pkg.dependencies['@tanstack/react-router'],
      },
      '@hot-labs/near-connect': {
        singleton: true,
        eager: false,
        requiredVersion: pkg.dependencies['@hot-labs/near-connect'],
      },
      'near-kit': {
        singleton: true,
        eager: false,
        requiredVersion: pkg.dependencies['near-kit'],
      },
    },
  }),
];

if (isProduction) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: (info: any) => {
          console.log('🚀 Host Deployed:', info.url);
          updateBosConfig(info.url);
        },
      },
    })
  );
}

export default defineConfig({
  plugins,
  source: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.USE_REMOTE_API': JSON.stringify(process.env.USE_REMOTE_API || 'false'),
      'process.env.USE_REMOTE_UI': JSON.stringify(process.env.USE_REMOTE_UI || 'false'),
      'process.env.PUBLIC_ACCOUNT_ID': JSON.stringify(bosConfig.account),
      'process.env.BETTER_AUTH_URL': JSON.stringify(process.env.BETTER_AUTH_URL || bosConfig.app.host[process.env.NODE_ENV || 'development']),
    },
    entry: {
      index: './src/index.client.tsx',
    },
  },
  html: {
    template: './index.html',
    templateParameters: {
      title: bosConfig.app.host.title,
      description: bosConfig.app.host.description,
    },
  },
  dev: {
    progressBar: false,
    client: {
      overlay: false,
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3000',
      '/__runtime-config': 'http://localhost:3000',
    },
  },
  tools: {
    rspack: {
      infrastructureLogging: {
        level: 'error',
      },
      stats: 'errors-warnings',
    },
  },
  output: {
    distPath: {
      root: 'dist',
    },
    assetPrefix: 'auto',
  },
});
