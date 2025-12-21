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

export interface HeadMeta {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
  charSet?: string;
}

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  sizes?: string;
  crossorigin?: string;
}

export interface HeadData {
  meta?: HeadMeta[];
  links?: HeadLink[];
}

export interface SSRRenderResult {
  stream: ReadableStream;
  dehydratedState: unknown;
  headData: HeadData;
}

function extractHeadData(router: any): HeadData {
  const meta: HeadMeta[] = [];
  const links: HeadLink[] = [];
  
  try {
    const matches = router.state?.matches || [];
    
    for (const match of matches) {
      const headFn = match.route?.options?.head;
      if (typeof headFn === 'function') {
        const headResult = headFn({
          params: match.params,
          loaderData: match.loaderData,
        });
        
        if (headResult?.meta) {
          meta.push(...headResult.meta);
        }
        if (headResult?.links) {
          links.push(...headResult.links);
        }
      }
    }
  } catch (error) {
    console.error('[SSR] Failed to extract head data:', error);
  }
  
  return { meta, links };
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

  const headData = extractHeadData(router);

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

  return { stream, dehydratedState, headData };
}

function getUiOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function renderMetaTags(headData: HeadData): { title: string; tags: string } {
  const tags: string[] = [];
  let title = '';
  
  if (headData.meta) {
    for (const meta of headData.meta) {
      if (meta.title) {
        title = meta.title;
        continue;
      }
      
      const attrs: string[] = [];
      if (meta.name) attrs.push(`name="${meta.name}"`);
      if (meta.property) attrs.push(`property="${meta.property}"`);
      if (meta.content) attrs.push(`content="${meta.content.replace(/"/g, '&quot;')}"`);
      if (meta.charSet) attrs.push(`charset="${meta.charSet}"`);
      
      if (attrs.length > 0) {
        tags.push(`  <meta ${attrs.join(' ')} />`);
      }
    }
  }
  
  if (headData.links) {
    for (const link of headData.links) {
      const attrs: string[] = [`rel="${link.rel}"`, `href="${link.href}"`];
      if (link.type) attrs.push(`type="${link.type}"`);
      if (link.sizes) attrs.push(`sizes="${link.sizes}"`);
      if (link.crossorigin) attrs.push(`crossorigin="${link.crossorigin}"`);
      
      tags.push(`  <link ${attrs.join(' ')} />`);
    }
  }
  
  return { title, tags: tags.join('\n') };
}

export function createSSRHtml(
  bodyContent: string,
  dehydratedState: unknown,
  config: RuntimeConfig,
  headData?: HeadData
): string {
  const clientConfig = {
    env: config.env,
    title: config.title,
    hostUrl: config.hostUrl,
    ui: config.ui,
    apiBase: '/api',
    rpcBase: '/api/rpc',
  };

  const uiOrigin = getUiOrigin(config.ui.url);
  
  const { title, tags } = headData 
    ? renderMetaTags(headData) 
    : { title: config.title, tags: '' };
  
  const pageTitle = title || config.title;

  return `<!DOCTYPE html>
<html lang="en" data-ssr="true">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <meta name="format-detection" content="telephone=no" />
  <title>${pageTitle}</title>
  
  <link rel="preconnect" href="${uiOrigin}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  
  <link rel="preload" href="${config.ui.url}/static/css/index.css" as="style" />
  <link rel="stylesheet" href="${config.ui.url}/static/css/index.css" />
  
${tags}
  
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
  
  <link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" />
  
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html { height: 100%; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { 
      min-height: 100%; 
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root">${bodyContent}</div>
  <script type="module" src="/static/js/index.js"></script>
</body>
</html>`;
}
