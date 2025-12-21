import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
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
import { resolve } from 'node:path';
import config from './rsbuild.config';
import { loadBosConfig, type RuntimeConfig } from './src/config';
import { db } from './src/db';
import * as schema from './src/db/schema/auth';
import { initializeServerFederation } from './src/federation.server';
import { initializeServerApiClient } from './src/lib/api-client.server';
import { auth } from './src/lib/auth';
import { createRouter } from './src/routers';
import { initializePlugins } from './src/runtime';
import { renderToStream, createSSRHtml } from './src/ssr';

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
  const preloadLink = `<link rel="preload" href="${config.ui.url}/remoteEntry.js" as="script" />`;

  return html
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

async function startServer() {
  const port = Number(process.env.PORT) || 3001;
  const apiPort = Number(process.env.API_PORT) || 3000;
  const isDev = process.env.NODE_ENV !== 'production';

  const bosConfig = await loadBosConfig();
  const plugins = await initializePlugins();
  const router = createRouter(plugins);

  initializeServerApiClient(router);

  // Setup graceful shutdown handlers
  const shutdown = async () => {
    console.log('[Plugins] Shutting down plugin runtime...');
    if (plugins.runtime) {
      await plugins.runtime.shutdown();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

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

  const apiApp = new Hono();

  apiApp.use(
    '/*',
    cors({
      origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) ?? [
        bosConfig.hostUrl,
        bosConfig.ui.url,
        "http://localhost:3001"
      ],
      credentials: true,
    })
  );

  apiApp.get('/health', (c) => c.text('OK'));

  apiApp.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  apiApp.all('/api/rpc/*', async (c) => {
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

  apiApp.all('/api/*', async (c) => {
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

  if (isDev) {
    serve({ fetch: apiApp.fetch, port: apiPort }, (info) => {
      logger.info(`API server running at http://localhost:${info.port}`);
      logger.info(
        `  http://localhost:${info.port}/api     → REST API (OpenAPI docs)`
      );
      logger.info(`  http://localhost:${info.port}/api/rpc → RPC endpoint`);
    });

    const rsbuild = await createRsbuild({
      cwd: import.meta.dirname,
      rsbuildConfig: config,
    });

    await rsbuild.startDevServer();
  } else {
    const ssrEnabled = process.env.DISABLE_SSR !== 'true';
    const indexHtml = await readFile(resolve(import.meta.dirname, './dist/index.html'), 'utf-8');
    const injectedHtml = injectRuntimeConfig(indexHtml, bosConfig);

    if (ssrEnabled) {
      initializeServerFederation(bosConfig);
    }

    apiApp.use('/*', serveStatic({ root: './dist' }));

    apiApp.get('*', async (c) => {
      if (ssrEnabled) {
        try {
          const url = new URL(c.req.url).pathname + new URL(c.req.url).search;
          const { stream, dehydratedState, headData } = await renderToStream({
            url,
            config: bosConfig,
          });

          const chunks: Uint8Array[] = [];
          const reader = stream.getReader();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          
          const bodyContent = new TextDecoder().decode(
            new Uint8Array(chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]))
          );
          
          const html = createSSRHtml(bodyContent, dehydratedState, bosConfig, headData);
          return c.html(html);
        } catch (error) {
          logger.error('[SSR] Render failed, falling back to CSR:', error);
          return c.html(injectedHtml);
        }
      }

      return c.html(injectedHtml);
    });

    serve({ fetch: apiApp.fetch, port }, (info) => {
      logger.info(
        `Host production server running at http://localhost:${info.port}`
      );
      logger.info(
        `  http://localhost:${info.port}/api     → REST API (OpenAPI docs)`
      );
      logger.info(`  http://localhost:${info.port}/api/rpc → RPC endpoint`);
      logger.info(`  SSR: ${ssrEnabled ? 'Enabled' : 'Disabled'}`);
    });
  }
}

startServer().catch((err) => {
  logger.error('Failed to start server');
  logger.error(err);
  process.exit(1);
});
