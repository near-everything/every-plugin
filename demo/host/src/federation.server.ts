import {
  createInstance,
  getInstance,
} from '@module-federation/enhanced/runtime';
import { setGlobalFederationInstance } from '@module-federation/runtime-core';
import type { RuntimeConfig } from './config';
import type { RouterModule } from './types';

const createModuleFederationInstance = (() => {
  let instance: ReturnType<typeof createInstance> | null = null;
  
  return (config: RuntimeConfig) => {
    if (instance) return instance;
    
    let existingInstance = getInstance();
    
    if (!config.ui.ssrUrl) {
      throw new Error('SSR URL not configured. Set app.ui.ssr in bos.config.json to enable SSR.');
    }

    if (!existingInstance) {
      existingInstance = createInstance({
        name: 'host',
        remotes: [
          {
            name: config.ui.name,
            entry: `${config.ui.ssrUrl}/remoteEntry.server.js`,
            alias: config.ui.name,
          },
        ],
      });
      
      setGlobalFederationInstance(existingInstance);
    }
    
    instance = existingInstance;
    return instance;
  };
})();

export async function loadRouterModule(config: RuntimeConfig): Promise<RouterModule> {
  const mf = createModuleFederationInstance(config);
  
  const routerModule = await mf.loadRemote<RouterModule>(`${config.ui.name}/Router`);
  
  if (!routerModule) {
    throw new Error(`Failed to load Router module from ${config.ui.name}`);
  }
  
  return routerModule;
}
