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

let runtimeConfig: RuntimeConfig | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  if (!runtimeConfig) {
    throw new Error('Runtime config not initialized');
  }
  return runtimeConfig;
}

export async function initializeFederation() {
  const config = await fetch('/__runtime-config').then((r) => r.json()) as RuntimeConfig;
  runtimeConfig = config;

  console.log('[Federation] Registering dynamic remote:', {
    name: config.ui.name,
    entry: `${config.ui.url}/remoteEntry.js`,
    alias: config.ui.name,
  });

  registerRemotes([
    {
      name: config.ui.name,
      entry: `${config.ui.url}/remoteEntry.js`,
      alias: config.ui.name,
    },
  ]);

  return config;
}
