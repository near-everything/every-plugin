import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createRsbuild, logger } from '@rsbuild/core';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { OpenAPIReferencePlugin } from '@orpc/openapi/plugins';
import { onError } from '@orpc/server';
import { formatORPCError } from 'every-plugin/errors';
import { RPCHandler } from '@orpc/server/fetch';
import { BatchHandlerPlugin } from '@orpc/server/plugins';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import config from './rsbuild.config';
import { initializePlugins } from './src/runtime';
import { loadBosConfig } from './src/config';
import { createRouter } from './src/routers';

// Populate process.env with values from rsbuild config source.define
if (config.source?.define) {
  for (const [key, value] of Object.entries(config.source.define)) {
    if (key.startsWith('process.env.')) {
      const envKey = key.replace('process.env.', '');
      if (process.env[envKey] === undefined) {
        process.env[envKey] = JSON.parse(value as string);
      }
    }
  }
}
import { auth } from './src/lib/auth';
import { db } from './src/db';
import * as schema from './src/db/schema/auth';
import { eq } from 'drizzle-orm';

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

  const rpcHandler = new RPCHandler(router, {
    plugins: [new BatchHandlerPlugin()],
    interceptors: [
      onError((error) => {
        console.error('\n=== Error ===');
        formatORPCError(error);
        
        if (error && typeof error === 'object') {
          if ('message' in error) console.error('Message:', error.message);
          if ('code' in error) console.error('Code:', error.code);
          if ('status' in error) console.error('Status:', error.status);
          if ('cause' in error) console.error('Cause:', error.cause);
          if ('stack' in error) console.error('Stack:', error.stack);
        } else {
          console.error('Error:', error);
        }
        console.error('=================\n');
      }),
    ],
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
    interceptors: [
      onError((error) => {
        console.error('\n=== Error ===');
        formatORPCError(error);
        
        if (error && typeof error === 'object') {
          if ('message' in error) console.error('Message:', error.message);
          if ('code' in error) console.error('Code:', error.code);
          if ('status' in error) console.error('Status:', error.status);
          if ('cause' in error) console.error('Cause:', error.cause);
          if ('stack' in error) console.error('Stack:', error.stack);
        } else {
          console.error('Error:', error);
        }
        console.error('=====================\n');
      }),
    ],
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

  // Runtime config endpoint - safe subset for client
  apiApp.get('/__runtime-config', async (c) => {
    const config = await loadBosConfig();
    return c.json({
      env: config.env,
      title: config.title,
      hostUrl: config.hostUrl,
      ui: config.ui,
      apiBase: '/api',
      rpcBase: '/api/rpc',
    });
  });

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
    apiApp.use('/*', serveStatic({ root: './dist' }));
    apiApp.get('*', serveStatic({ root: './dist', path: 'index.html' }));

    serve({ fetch: apiApp.fetch, port }, (info) => {
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
