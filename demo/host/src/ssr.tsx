import { createElement } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { RouterProvider } from '@tanstack/react-router';
import { createMemoryHistory } from '@tanstack/react-router';
import { QueryClientProvider, dehydrate, type QueryClient } from '@tanstack/react-query';
import { loadRemoteModule } from './federation.server';
import type { RuntimeConfig } from './config';

interface CreateRouterResult {
  router: any;
  queryClient: QueryClient;
}

interface RouterModule {
  createRouter: (opts?: { context?: { queryClient?: QueryClient } }) => CreateRouterResult;
}

export interface SSRRenderOptions {
  url: string;
  config: RuntimeConfig;
}

export interface SSRRenderResult {
  stream: ReadableStream;
  dehydratedState: unknown;
}

export async function renderToStream(options: SSRRenderOptions): Promise<SSRRenderResult> {
  const { url, config } = options;

  const routerModule = await loadRemoteModule<RouterModule>(config.ui.name, 'Router');
  const { router, queryClient } = routerModule.createRouter();

  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  });

  router.update({ history: memoryHistory });

  await router.load();

  const App = createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(RouterProvider, { router })
  );

  const stream = await renderToReadableStream(App, {
    onError(error) {
      console.error('[SSR] Render error:', error);
    },
  });

  const dehydratedState = dehydrate(queryClient);

  return { stream, dehydratedState };
}

export function createSSRHtml(
  bodyContent: string,
  dehydratedState: unknown,
  config: RuntimeConfig
): string {
  const clientConfig = {
    env: config.env,
    title: config.title,
    hostUrl: config.hostUrl,
    ui: config.ui,
    apiBase: '/api',
    rpcBase: '/api/rpc',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${config.title}</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  
  <script>
    (function() {
      var t = localStorage.getItem('theme');
      if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    })();
  </script>
  
  <script>window.__RUNTIME_CONFIG__=${JSON.stringify(clientConfig)};</script>
  <script>window.__DEHYDRATED_STATE__=${JSON.stringify(dehydratedState)};</script>
  
  <link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" crossorigin="anonymous" />
  
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; -webkit-font-smoothing: antialiased; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; background-color: #fff; color: #171717; }
    html.dark body { background-color: #171717; color: #fafafa; }
  </style>
</head>
<body>
  <div id="root">${bodyContent}</div>
  <script type="module" src="/static/js/index.js"></script>
</body>
</html>`;
}
