import { registerRemotes } from '@module-federation/enhanced/runtime';
import type { WindowRuntimeConfig } from './types';

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: WindowRuntimeConfig;
  }
}

let runtimeConfig: WindowRuntimeConfig | null = null;

export function getRuntimeConfig(): WindowRuntimeConfig {
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

  registerRemotes([
    {
      name: runtimeConfig.ui.name,
      entry: `${runtimeConfig.ui.url}/remoteEntry.js`,
      alias: runtimeConfig.ui.name,
    },
  ]);

  return runtimeConfig;
}
