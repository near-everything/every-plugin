import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydrationBoundary, QueryClientProvider, type DehydratedState } from '@tanstack/react-query';
import { RouterClient } from '@tanstack/react-router/ssr/client';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { initializeFederation, getRuntimeConfig } from './federation';
import type { RouterModule } from './types';

declare global {
  interface Window {
    __DEHYDRATED_STATE__?: DehydratedState;
  }
}

async function hydrate() {
  await initializeFederation();

  const config = getRuntimeConfig();
  
  const routerModule = await loadRemote<RouterModule>(`${config.ui.name}/Router`);
  
  if (!routerModule) {
    throw new Error(`Failed to load Router module from ${config.ui.name}`);
  }

  const { env, title, hostUrl, apiBase, rpcBase } = config;
  const { router, queryClient } = routerModule.createRouter({
    context: {
      assetsUrl: config.ui.url,
      runtimeConfig: { env, title, hostUrl, apiBase, rpcBase },
    },
  });
  
  const dehydratedState = window.__DEHYDRATED_STATE__;

  hydrateRoot(
    document,
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <RouterClient router={router} />
        </HydrationBoundary>
      </QueryClientProvider>
    </StrictMode>
  );

  console.log('[Client] Hydrated SSR');
}

hydrate().catch((error) => {
  console.error('Failed to hydrate:', error);
});
