import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HydrationBoundary, QueryClientProvider, type DehydratedState } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { RouterClient } from '@tanstack/react-router/ssr/client';
import { loadRemote } from '@module-federation/enhanced/runtime';
import { initializeFederation, getRuntimeConfig } from './federation';
import type { RouterModule } from './types';

declare global {
  interface Window {
    __DEHYDRATED_STATE__?: DehydratedState;
    __TSR_DEHYDRATED__?: unknown;
  }
}

async function render() {
  await initializeFederation();
  
  const pathname = window.location.pathname;
  
  if (pathname === '/components') {
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Root element not found for /components route');
    }
    const ComponentModule = await import('./components');
    createRoot(rootElement).render(
      <StrictMode>
        <ComponentModule.default />
      </StrictMode>
    );
    return;
  }

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
  const isSSR = !!window.__TSR_DEHYDRATED__;

  if (isSSR) {
    const ssrApp = (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={dehydratedState}>
            <RouterClient router={router} />
          </HydrationBoundary>
        </QueryClientProvider>
      </StrictMode>
    );

    hydrateRoot(document, ssrApp);
    console.log('[Client] Hydrated SSR');
  } else {
    const csrApp = (
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <HydrationBoundary state={dehydratedState}>
            <RouterProvider router={router} />
          </HydrationBoundary>
        </QueryClientProvider>
      </StrictMode>
    );

    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Root element not found');
    }
    
    createRoot(rootElement).render(csrApp);
    console.log('[Client] Rendered CSR');
  }
}

render().catch((error) => {
  console.error('Failed to initialize:', error);
  const rootElement = document.getElementById('root');
  if (rootElement && !rootElement.hasChildNodes()) {
    rootElement.innerHTML = '<div style="color: red; padding: 20px;">Failed to initialize. Check console.</div>';
  }
});
