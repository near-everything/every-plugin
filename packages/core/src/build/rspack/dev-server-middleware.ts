import type { PluginInfo } from './utils';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
};

const applyCorsHeaders = (res: any) => {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
};

const normalizePrefix = (prefix?: string): string => {
  if (!prefix) return '';
  const cleaned = prefix.replace(/^\/+|\/+$/g, '');
  return cleaned ? `/${cleaned}` : '';
};

export function setupPluginMiddleware(devServer: any, pluginInfo: PluginInfo, devConfig: any, port: number) {
  const rpcPrefix = normalizePrefix(devConfig?.prefix);
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
            remote: `http://localhost:${port}/remoteEntry.js`
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

      const formatError = (error: any, context: string) => {
        const lines: string[] = [`\n🔴 ${context} Error: ${error.message || 'Unknown error'}`];
        
        if (error.cause?.issues && Array.isArray(error.cause.issues)) {
          lines.push('\n📋 Validation Issues:');
          error.cause.issues.forEach((issue: any, index: number) => {
            lines.push(`  ${index + 1}. ${issue.path?.join('.') || 'root'}`);
            lines.push(`     ├─ Code: ${issue.code || 'unknown'}`);
            lines.push(`     ├─ Message: ${issue.message || 'No message'}`);
            if (issue.expected !== undefined) {
              lines.push(`     ├─ Expected: ${JSON.stringify(issue.expected)}`);
            }
            if (issue.received !== undefined) {
              lines.push(`     └─ Received: ${JSON.stringify(issue.received)}`);
            } else {
              lines.push(`     └─ (end)`);
            }
          });
        }
        
        if (error.data && typeof error.data === 'object' && Object.keys(error.data).length > 0) {
          lines.push('\n📊 Error Data:');
          try {
            const dataStr = JSON.stringify(error.data, null, 2);
            dataStr.split('\n').forEach(line => {
              lines.push(`  ${line}`);
            });
          } catch {
            lines.push(`  ${String(error.data)}`);
          }
        }
        
        if (error.cause?.data) {
          lines.push('\n📦 Request Data:');
          try {
            const dataStr = JSON.stringify(error.cause.data, null, 2);
            dataStr.split('\n').forEach(line => {
              lines.push(`  ${line}`);
            });
          } catch {
            lines.push(`  ${String(error.cause.data)}`);
          }
        }
        
        if (error.code) {
          lines.push(`\n⚠️  Error Code: ${error.code}`);
        }
        
        if (error.status) {
          lines.push(`📍 Status: ${error.status}`);
        }
        
        lines.push('');
        console.error(lines.join('\n'));
      };

      // @ts-expect-error no type
      handlers.rpc = new RPCHandler(loaded.router, {
        interceptors: [
          onError((error: any) => {
            formatError(error, 'RPC');
          }),
        ]
      });

      // @ts-expect-error no type
      handlers.api = new OpenAPIHandler(loaded.router, {
        plugins: [
          new OpenAPIReferencePlugin({
            schemaConverters: [new ZodToJsonSchemaConverter()],
          }),
        ],
        interceptors: [
          onError((error: any) => {
            formatError(error, 'OpenAPI');
          }),
        ]
      });

      console.log(`╭─────────────────────────────────────────────`);
      console.log(`│  ✅ Plugin dev server ready: `);
      console.log(`├─────────────────────────────────────────────`);
      console.log(`│  📡 RPC:    http://localhost:${port}/api/rpc${rpcPrefix}`);
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

  devServer.app.options('*', (req: any, res: any) => {
    applyCorsHeaders(res);
    res.status(200).end();
  });

  devServer.app.get('/', (req: any, res: any) => {
    applyCorsHeaders(res);
    res.json({
      ok: true,
      plugin: pluginInfo.normalizedName,
      version: pluginInfo.version,
      status: devServer.app.locals.handlers?.rpc ? 'ready' : 'loading',
      endpoints: {
        health: '/',
        docs: '/api',
        rpc: `/api/rpc${rpcPrefix}`
      }
    });
  });

  // OpenAPI documentation and REST endpoints at /api and /api/*
  const handleApiRequest = async (req: any, res: any) => {
    applyCorsHeaders(res);
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

  devServer.app.all(`/api/rpc${rpcPrefix}/*`, async (req: any, res: any) => {
    applyCorsHeaders(res);
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
        prefix: `/api/rpc${rpcPrefix}`,
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
