import fs from 'node:fs';
import path from 'node:path';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { withZephyr } from 'zephyr-rsbuild-plugin';
import { getHostSharedDependencies } from 'every-plugin/build/rspack';

const __dirname = import.meta.dirname;
const isProduction = process.env.NODE_ENV === 'production';

const configPath = process.env.BOS_CONFIG_PATH ?? path.resolve(__dirname, '../bos.config.json');
const bosConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function resolveSource(envVar: string | undefined): 'local' | 'remote' {
  if (envVar === 'local' || envVar === 'remote') return envVar;
  return isProduction ? 'remote' : 'local';
}

const uiSource = resolveSource(process.env.UI_SOURCE);

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

const hostSharedDeps = getHostSharedDependencies();

const plugins = [
  pluginReact(),
  pluginModuleFederation({
    name: 'host',
    remotes: {},
    dts: false,
    shared: hostSharedDeps,
  }),
];

if (isProduction) {
  plugins.push(
    withZephyr({
      hooks: {
        onDeployComplete: (info: { url: string }) => {
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
      'process.env.UI_SOURCE': JSON.stringify(uiSource),
      'process.env.API_SOURCE': JSON.stringify(process.env.API_SOURCE || (isProduction ? 'remote' : 'local')),
      'process.env.PUBLIC_ACCOUNT_ID': JSON.stringify(bosConfig.account),
      'process.env.BETTER_AUTH_URL': JSON.stringify(process.env.BETTER_AUTH_URL || bosConfig.app.host[process.env.NODE_ENV || 'development']),
    },
    entry: {
      index: './src/index.client.tsx',
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
      js: 'static/js',
    },
    assetPrefix: '/',
    filename: {
      js: '[name].js',
    },
  },
});
