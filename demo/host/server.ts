import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { BatchHandlerPlugin } from '@orpc/server/plugins';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { createRsbuild, logger } from '@rsbuild/core';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { formatORPCError } from 'every-plugin/errors';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { resolve } from 'node:path';
import config from './rsbuild.config';
import { loadBosConfig, type RuntimeConfig } from './src/config';
import { loadRouterModule } from './src/federation.server';
import type { HeadData } from './src/types';
import { db } from './src/db';
import * as schema from './src/db/schema/auth';
import { initializeServerApiClient } from './src/lib/api-client.server';
import { auth } from './src/lib/auth';
import { createRouter } from './src/routers';
import { initializePlugins, type PluginResult } from './src/runtime';

function nodeHeadersToHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value) {
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }
  }
  return headers;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHeadToString(head: HeadData): string {
  const parts: string[] = [];

  for (const meta of head.meta) {
    if (!meta) continue;
    const metaObj = meta as Record<string, unknown>;
    if ('title' in metaObj && metaObj.title) {
      parts.push(`<title>${escapeHtml(String(metaObj.title))}</title>`);
    } else {
      const attrs = Object.entries(metaObj)
        .filter(([k, v]) => k !== 'children' && v !== undefined)
        .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
        .join(' ');
      if (attrs) parts.push(`<meta ${attrs} />`);
    }
  }

  for (const link of head.links) {
    if (!link) continue;
    const linkObj = link as Record<string, unknown>;
    const attrs = Object.entries(linkObj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
      .join(' ');
    if (attrs) parts.push(`<link ${attrs} />`);
  }

  for (const script of head.scripts) {
    if (!script) continue;
    const scriptObj = script as Record<string, unknown>;
    const { children, ...rest } = scriptObj;
    const attrs = Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) =>
        typeof v === 'boolean' ? (v ? k : '') : `${k}="${escapeHtml(String(v))}"`
      )
      .filter(Boolean)
      .join(' ');
    if (children) {
      parts.push(`<script ${attrs}>${children}</script>`);
    } else if (attrs) {
      parts.push(`<script ${attrs}></script>`);
    }
  }

  return parts.join('\n    ');
}

function injectRuntimeConfig(html: string, config: RuntimeConfig): string {
  const clientConfig = {
    env: config.env,
    title: config.title,
    hostUrl: config.hostUrl,
    ui: config.ui,
    apiBase: '/api',
    rpcBase: '/api/rpc',
  };
  const configScript = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(clientConfig)};</script>`;
  const preloadLink = `<link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" crossorigin="anonymous" />`;

  return html
    .replace('<!--__HEAD_CONTENT__-->', '')
    .replace('<!--__RUNTIME_CONFIG__-->', configScript)
    .replace('<!--__REMOTE_PRELOAD__-->', preloadLink);
}

async function createContext(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });

  // Get NEAR account ID from linked accounts
  let nearAccountId: string | null = null;
  if (session?.user?.id) {
    const nearAccount = await db.query.nearAccount.findFirst({
      where: eq(schema.nearAccount.userId, session.user.id),
    });
    nearAccountId = nearAccount?.accountId ?? null;
  }

  return {
    session,
    user: session?.user,
    nearAccountId,
  };
}

async function proxyRequest(req: Request, targetBase: string): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;
  
  const headers = new Headers(req.headers);
  headers.delete('host');
  
  const proxyReq = new Request(targetUrl, {
    method: req.method,
    headers,
    body: req.body,
    duplex: 'half',
  } as RequestInit);
  
  return fetch(proxyReq);
}

function setupApiRoutes(
  app: Hono,
  bosConfig: RuntimeConfig,
  plugins: PluginResult
) {
  const isProxyMode = !!bosConfig.api.proxy;
  
  if (isProxyMode) {
    const proxyTarget = bosConfig.api.proxy!;
    logger.info(`[API] Proxy mode enabled → ${proxyTarget}`);
    
    app.all('/api/*', async (c) => {
      const response = await proxyRequest(c.req.raw, proxyTarget);
      return response;
    });
    
    return;
  }

  const router = createRouter(plugins);
  initializeServerApiClient(router);

  const rpcHandler = new RPCHandler(router, {
    plugins: [new BatchHandlerPlugin()],
    interceptors: [onError((error) => formatORPCError(error))],
  });

  const apiHandler = new OpenAPIHandler(router, {
    plugins: [
      new OpenAPIReferencePlugin({
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: {
          info: {
            title: bosConfig.title,
            version: '1.0.0',
          },
          servers: [{ url: `${bosConfig.hostUrl}/api` }],
        },
      }),
    ],
    interceptors: [onError((error) => formatORPCError(error))],
  });

  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.all('/api/rpc/*', async (c) => {
    const req = c.req.raw;
    const context = await createContext(req);

    const result = await rpcHandler.handle(req, {
      prefix: '/api/rpc',
      context,
    });

    return result.response
      ? c.newResponse(result.response.body, result.response)
      : c.text('Not Found', 404);
  });

  app.all('/api/*', async (c) => {
    const req = c.req.raw;
    const context = await createContext(req);

    const result = await apiHandler.handle(req, {
      prefix: '/api',
      context,
    });

    return result.response
      ? c.newResponse(result.response.body, result.response)
      : c.text('Not Found', 404);
  });
}

async function startServer() {
  const port = Number(process.env.PORT) || 3001;
  const isDev = process.env.NODE_ENV !== 'production';

  const bosConfig = await loadBosConfig();
  
  const isProxyMode = !!bosConfig.api.proxy;
  let plugins: PluginResult = { runtime: null, api: null, status: { available: false, pluginName: null, error: null, errorDetails: null } };
  
  if (!isProxyMode) {
    plugins = await initializePlugins();
  }

  const shutdown = async () => {
    console.log('[Plugins] Shutting down plugin runtime...');
    if (plugins.runtime) {
      await plugins.runtime.shutdown();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const app = new Hono();

  app.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? [
        bosConfig.hostUrl,
        bosConfig.ui.url,
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      credentials: true,
    })
  );

  app.use('/*', compress());

  app.get('/health', (c) => c.text('OK'));

  setupApiRoutes(app, bosConfig, plugins);

  if (isDev) {
    logger.info(`[Config] UI source: ${bosConfig.ui.source} → ${bosConfig.ui.url}`);
    logger.info(`[Config] API source: ${bosConfig.api.source} → ${bosConfig.api.url}`);
    if (isProxyMode) {
      logger.info(`[Config] API proxy: ${bosConfig.api.proxy}`);
    }

    const rsbuild = await createRsbuild({
      cwd: import.meta.dirname,
      rsbuildConfig: config,
    });

    const devServer = await rsbuild.createDevServer();

    const server = createServer((req, res) => {
      const url = req.url || '/';
      
      if (url.startsWith('/api')) {
        const fetchReq = new Request(`http://localhost:${port}${url}`, {
          method: req.method,
          headers: nodeHeadersToHeaders(req.headers),
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
          duplex: 'half',
        } as RequestInit);
        
        Promise.resolve(app.fetch(fetchReq)).then(async (response: Response) => {
          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });
          const body = await response.arrayBuffer();
          res.end(Buffer.from(body));
        }).catch((err: Error) => {
          logger.error('[API] Error handling request:', err);
          res.statusCode = 500;
          res.end('Internal Server Error');
        });
        return;
      }

      devServer.middlewares(req, res);
    });

    server.listen(port, () => {
      logger.info(`Host dev server running at http://localhost:${port}`);
      logger.info(`  http://localhost:${port}/api     → REST API (OpenAPI docs)`);
      logger.info(`  http://localhost:${port}/api/rpc → RPC endpoint`);
    });

    devServer.afterListen();
    devServer.connectWebSocket({ server });
  } else {
    app.use('/*', serveStatic({ root: './dist' }));

    if (bosConfig.ui.ssrUrl) {
      logger.info('[Head] Loading Remote Router module for head extraction...');
      const routerModule = await loadRouterModule(bosConfig);
      logger.info('[Head] Remote Router module loaded successfully');

      app.get('*', async (c) => {
        try {
          const url = new URL(c.req.url);
          const { env, title, hostUrl } = bosConfig;
          
          const headData = await routerModule.getRouteHead(url.pathname, {
            assetsUrl: bosConfig.ui.url,
            runtimeConfig: { env, title, hostUrl, apiBase: '/api', rpcBase: '/api/rpc' },
          });
          
          const headHtml = renderHeadToString(headData);
          
          const clientConfig = {
            env: bosConfig.env,
            title: bosConfig.title,
            hostUrl: bosConfig.hostUrl,
            ui: bosConfig.ui,
            apiBase: '/api',
            rpcBase: '/api/rpc',
          };
          const configScript = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(clientConfig)};</script>`;
          const preloadLink = `<link rel="preload" href="${bosConfig.ui.url}/remoteEntry.js" as="script" crossorigin="anonymous" />`;
          
          const indexHtml = await readFile(resolve(import.meta.dirname, './dist/index.html'), 'utf-8');
          const html = indexHtml
            .replace('<!--__HEAD_CONTENT__-->', headHtml)
            .replace('<!--__RUNTIME_CONFIG__-->', configScript)
            .replace('<!--__REMOTE_PRELOAD__-->', preloadLink);
          
          return c.html(html);
        } catch (error) {
          logger.error('[Head] Extraction error:', error);
          const indexHtml = await readFile(resolve(import.meta.dirname, './dist/index.html'), 'utf-8');
          const injectedHtml = injectRuntimeConfig(indexHtml, bosConfig);
          return c.html(injectedHtml);
        }
      });
    } else {
      logger.info('[Head] Head extraction disabled - no ui.ssr URL configured in bos.config.json');
      
      app.get('*', async (c) => {
        const indexHtml = await readFile(resolve(import.meta.dirname, './dist/index.html'), 'utf-8');
        const injectedHtml = injectRuntimeConfig(indexHtml, bosConfig);
        return c.html(injectedHtml);
      });
    }

    serve({ fetch: app.fetch, port }, (info) => {
      logger.info(
        `Host production server running at http://localhost:${info.port}`
      );
      logger.info(
        `  http://localhost:${info.port}/api     → REST API (OpenAPI docs)`
      );
      logger.info(`  http://localhost:${info.port}/api/rpc → RPC endpoint`);
    });
  }
}

startServer().catch((err) => {
  logger.error('Failed to start server');
  logger.error(err);
  process.exit(1);
});
