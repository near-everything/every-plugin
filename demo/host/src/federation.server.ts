import { createInstance } from '@module-federation/enhanced/runtime';
import type { RuntimeConfig } from './config';

let mfInstance: ReturnType<typeof createInstance> | null = null;

export function getServerFederationInstance() {
  return mfInstance;
}

export function initializeServerFederation(config: RuntimeConfig) {
  if (mfInstance) {
    console.log('[Federation Server] Using existing instance');
    return mfInstance;
  }

  mfInstance = createInstance({
    name: 'host_ssr',
    remotes: [
      {
        name: config.ui.name,
        entry: `${config.ui.url}/remoteEntry.js`,
        alias: config.ui.name,
      },
    ],
  });

  console.log('[Federation Server] Created new instance with remote:', config.ui.name);
  return mfInstance;
}

export async function loadRemoteModule<T>(remoteName: string, exposedModule: string): Promise<T> {
  if (!mfInstance) {
    throw new Error('Server federation not initialized. Call initializeServerFederation first.');
  }

  const modulePath = `${remoteName}/${exposedModule}`;
  const module = await mfInstance.loadRemote<T>(modulePath);

  if (!module) {
    throw new Error(`Failed to load remote module: ${modulePath}`);
  }

  return module;
}
