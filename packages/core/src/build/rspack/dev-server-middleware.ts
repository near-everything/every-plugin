import type { PluginInfo } from './utils';

export function setupPluginMiddleware(devServer: any, pluginInfo: PluginInfo, devConfig: any, port: number) {
  let handlers: { rpc: any, api: any } = { rpc: null, api: null };
  let cleanup: (() => Promise<void>) | null = null;

  const performCleanup = async () => {
    if (cleanup) {
      await cleanup();
      cleanup = null;
    }
  };

  (async () => {
    await performCleanup();

    try {
      const { createPluginRuntime } = await import('every-plugin');
      const { RPCHandler } = await import('@orpc/server/fetch');
      const { onError } = await import('@orpc/server');
      const { OpenAPIHandler } = await import('@orpc/openapi/fetch');
      const { OpenAPIReferencePlugin } = await import('@orpc/openapi/plugins');
      const { ZodToJsonSchemaConverter } = await import('@orpc/zod/zod4');

      const pluginId = devConfig?.pluginId || pluginInfo.normalizedName;

      const runtime = createPluginRuntime({
        registry: {
          [pluginId]: {
            remoteUrl: `http://localhost:${port}/remoteEntry.js`
          }
        }
      });

      const loaded = await runtime.usePlugin(pluginId, devConfig?.config);

      cleanup = async () => {
        if (loaded && typeof (loaded as any).dispose === 'function') {
          await (loaded as any).dispose();
        }
        if (runtime && typeof (runtime as any).cleanup === 'function') {
          await (runtime as any).cleanup();
        }
        handlers.rpc = null;
        handlers.api = null;
        if (devServer.app.locals.handlers) {
          devServer.app.locals.handlers = null;
        }
      };

      // @ts-expect-error no type
      handlers.rpc = new RPCHandler(loaded.router, {
        interceptors: [
          onError((error: any) => {
            console.error('🔴 RPC Error:', error);
          }),
        ]
      });

      // Create OpenAPI handler for documentation
      // @ts-expect-error no type
      handlers.api = new OpenAPIHandler(loaded.router, {
        plugins: [
          new OpenAPIReferencePlugin({
            schemaConverters: [new ZodToJsonSchemaConverter()],
          }),
        ],
        interceptors: [
          onError((error: any) => {
            console.error('🔴 OpenAPI Error:', error);
          }),
        ]
      });

      console.log(`╭─────────────────────────────────────────────`);
      console.log(`│  ✅ Plugin dev server ready: `);
      console.log(`├─────────────────────────────────────────────`);
      console.log(`│  📡 RPC:    http://localhost:${port}/api/rpc`);
      console.log(`│  📖 Docs:   http://localhost:${port}/api`);
      console.log(`│  💚 Health: http://localhost:${port}/`);
      console.log(`╰─────────────────────────────────────────────`);

      devServer.app.locals.handlers = handlers;

      if (devServer.server) {
        devServer.server.once('close', async () => {
          await performCleanup();
        });
      }
    } catch (error) {
      console.error('❌ Failed to load plugin:', error);
      await performCleanup();
    }
  })();

  process.once('SIGINT', async () => {
    await performCleanup();
  });
  process.once('SIGTERM', async () => {
    await performCleanup();
  });

  // Root health check
  devServer.app.get('/', (req: any, res: any) => {
    res.json({
      ok: true,
      plugin: pluginInfo.normalizedName,
      version: pluginInfo.version,
      status: devServer.app.locals.handlers?.rpc ? 'ready' : 'loading',
      endpoints: {
        health: '/',
        docs: '/api',
        rpc: '/api/rpc'
      }
    });
  });

  // OpenAPI documentation and REST endpoints at /api and /api/*
  const handleApiRequest = async (req: any, res: any) => {
    const apiHandler = devServer.app.locals.handlers?.api;
    if (!apiHandler) {
      return res.status(503).json({ error: 'Plugin still loading...' });
    }

    try {
      const url = `http://${req.headers.host}${req.url}`;
      const webRequest = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        duplex: req.method !== 'GET' && req.method !== 'HEAD' ? 'half' : undefined
      } as RequestInit);

      const result = await apiHandler.handle(webRequest, {
        prefix: '/api',
        context: {}
      });

      if (result.response) {
        res.status(result.response.status);
        result.response.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        const text = await result.response.text();
        res.send(text);
      } else {
        res.status(404).send('Not Found');
      }
    } catch (error) {
      console.error('OpenAPI error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  };

  devServer.app.all('/api', handleApiRequest);
  devServer.app.all('/api/*', handleApiRequest);

  // RPC calls at /api/rpc/*
  devServer.app.all('/api/rpc/*', async (req: any, res: any) => {
    const rpcHandler = devServer.app.locals.handlers?.rpc;
    if (!rpcHandler) {
      return res.status(503).json({ error: 'Plugin still loading...' });
    }

    try {
      const url = `http://${req.headers.host}${req.url}`;
      const webRequest = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        duplex: req.method !== 'GET' && req.method !== 'HEAD' ? 'half' : undefined
      } as RequestInit);

      const result = await rpcHandler.handle(webRequest, {
        prefix: '/api/rpc',
        context: {}
      });

      if (result.response) {
        res.status(result.response.status);
        result.response.headers.forEach((value: string, key: string) => {
          res.setHeader(key, value);
        });
        const text = await result.response.text();
        res.send(text);
      } else {
        res.status(404).send('Not Found');
      }
    } catch (error) {
      console.error('RPC error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
}
