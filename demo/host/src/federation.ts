import { registerRemotes } from '@module-federation/enhanced/runtime';

interface RuntimeConfig {
  env: 'development' | 'production';
  title: string;
  hostUrl: string;
  ui: {
    name: string;
    url: string;
    exposes: Record<string, string>;
  };
  apiBase: string;
  rpcBase: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

let runtimeConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) {
    throw new Error('Runtime config not initialized. Ensure window.__RUNTIME_CONFIG__ is set.');
  }
  return runtimeConfig;
}

export async function initializeFederation() {
  if (!window.__RUNTIME_CONFIG__) {
    throw new Error('Runtime config not found. SSR should always inline __RUNTIME_CONFIG__.');
  }
  
  runtimeConfig = window.__RUNTIME_CONFIG__;

  console.log('[Federation] Registering dynamic remote:', {
    name: runtimeConfig.ui.name,
    entry: `${runtimeConfig.ui.url}/remoteEntry.js`,
    alias: runtimeConfig.ui.name,
  });

  registerRemotes([
    {
      name: runtimeConfig.ui.name,
      entry: `${runtimeConfig.ui.url}/remoteEntry.js`,
      alias: runtimeConfig.ui.name,
    },
  ]);

  return runtimeConfig;
}
