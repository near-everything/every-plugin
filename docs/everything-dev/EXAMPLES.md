# Examples

Complete end-to-end workflows showing how to build, deploy, and use everything.dev modules.

## Example 1: KV Storage API

Create a key-value storage plugin with full CRUD operations.

### Scaffold Plugin

```bash
# Create plugin with KV template
everything-dev add plugin api-kv --template kv-storage

# Or manually
mkdir -p plugins/api-kv/src
cd plugins/api-kv
npm init -y
npm install --save-dev rsbuild rspack @module-federation/rsbuild-plugin
npm install --save every-plugin
npm install --save-dev vitest
```

### Create Files

**`plugins/api-kv/src/contract.ts`**
```typescript
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

export const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .tags(['health']),

  getValue: oc
    .route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ value: z.string().nullable() }))
    .tags(['kv']),

  setValue: oc
    .route({ method: 'POST', path: '/value' })
    .input(z.object({ key: z.string(), value: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .tags(['kv']),

  deleteKey: oc
    .route({ method: 'DELETE', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .tags(['kv']),

  listKeys: oc
    .route({ method: 'GET', path: '/keys' })
    .input(z.object({ limit: z.number().default(10) }))
    .output(z.object({ keys: z.array(z.string()) }))
    .tags(['kv']),
});
```

**`plugins/api-kv/src/service.ts`**
```typescript
export class KvService {
  constructor(private dbUrl: string, private authToken: string) {}

  async get(key: string): Promise<string | null> {
    const response = await fetch(`${this.dbUrl}/get`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return data.value;
  }

  async set(key: string, value: string): Promise<void> {
    const response = await fetch(`${this.dbUrl}/set`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.dbUrl}/delete`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async list(limit: number): Promise<string[]> {
    const response = await fetch(`${this.dbUrl}/list?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${this.authToken}` },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.keys;
  }
}
```

**`plugins/api-kv/src/index.ts`**
```typescript
import { createPlugin } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { contract } from './contract';
import { KvService } from './service';

export default createPlugin({
  variables: z.object({}),
  secrets: z.object({
    KV_DATABASE_URL: z.string().url(),
    KV_DATABASE_AUTH_TOKEN: z.string(),
  }),
  contract,

  initialize: (config) => Effect.gen(function* () {
    const service = new KvService(config.secrets.KV_DATABASE_URL, config.secrets.KV_DATABASE_AUTH_TOKEN);
    yield* Effect.log('KV service initialized');
    return { service };
  }),

  createRouter: ({ service }, builder) => ({
    ping: builder.ping.handler(async () => ({ status: 'ok' })),

    getValue: builder.getValue.handler(async ({ input }) => {
      const value = await Effect.runPromise(service.get(input.key));
      return { value };
    }),

    setValue: builder.setValue.handler(async ({ input }) => {
      await Effect.runPromise(service.set(input.key, input.value));
      return { success: true as const };
    }),

    deleteKey: builder.deleteKey.handler(async ({ input }) => {
      await Effect.runPromise(service.delete(input.key));
      return { success: true as const };
    }),

    listKeys: builder.listKeys.handler(async ({ input }) => {
      const keys = await Effect.runPromise(service.list(input.limit));
      return { keys };
    }),
  }),
});
```

**`plugins/api-kv/rsbuild.config.ts`**
```typescript
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  plugins: [
    pluginReact(),

    pluginModuleFederation({
      name: 'api-kv',
      filename: 'remoteEntry.js',
      exposes: {
        './plugin': './src/index.ts',
      },
    }),
  ],
});
```

### Develop Locally

```bash
cd plugins/api-kv

# Install dependencies
npm install

# Start dev server
everything-dev dev local

# Test endpoint
curl http://localhost:3000/api/ping
```

### Deploy

```bash
# Deploy to Zephyr
cd plugins/api-kv
DEPLOY=true npm run build

# Get deployed URL (output shows: https://cdn.zephyr.com/v1234/api-kv/remoteEntry.js)
```

## Example 2: TanStack Router UI

Create a SSR UI with TanStack Router.

### Scaffold UI

```bash
everything-dev add ui my-app --template tanstack

# Manual setup
mkdir -p ui/my-app/src/{routes,components,hooks}
cd ui/my-app
npm init -y
npm install react react-dom @tanstack/react-router @tanstack/react-query
npm install --save-dev rsbuild rspack @module-federation/rsbuild-plugin @rsbuild/plugin-react @tanstack/router-plugin/rspack
npm install everything-plugin everything-dev/ui
```

### Create Files

**`ui/my-app/src/everything-dev.ts`**
```typescript
import type { EverythingUiModule } from 'everything-dev/ui';
import { renderToStream } from './router.server';

export const everything: EverythingUiModule = {
  ssr: {
    router: './src/router.server.tsx',
    renderToStream: async (request, options) => {
      const url = new URL(request.url);
      const pathname = url.pathname + url.search;
      const stream = await renderRouterToStream({ pathname });
      const html = await streamToString(stream.body!);
      const injected = html.replace(
        '</head>',
        `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(options.runtimeConfig)}</script></head>`
      );
      return {
        stream: stringToStream(injected),
        statusCode: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
      };
    },
  },

  client: {
    hydrate: './src/hydrate.tsx',
  },

  exposedComponents: {
    Button: './src/components/button.tsx',
    Card: './src/components/card.tsx',
  },

  exposedRoutes: [
    { path: '/', title: 'Home' },
    { path: '/login', title: 'Login' },
  ],

  capabilities: ['ssr', 'hydration', 'routing'],
};
```

**`ui/my-app/src/router.server.tsx`**
```typescript
import { renderRouterToStream } from '@tanstack/react-router/ssr/server';

export async function renderRouterToStream({
  pathname,
  config,
}: {
  pathname: string;
  config?: { assetsUrl: string };
}) {
  const request = new Request(`http://localhost${pathname}`);

  const response = await fetch(`http://localhost:3000/ssr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pathname, config }),
  });

  return response;
}

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

export function stringToStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}
```

**`ui/my-app/src/router.tsx`**
```typescript
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter({ history }: { history: History }) {
  return createTanStackRouter({
    routeTree,
    history,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}
```

**`ui/my-app/src/hydrate.tsx`**
```typescript
import { hydrateRoot } from 'react-dom/client';
import { createRouter } from './router';

if (typeof window !== 'undefined') {
  const config = window.__RUNTIME_CONFIG__;
  console.log('[Hydrate] Config:', config);

  const router = createRouter({ history: window.history as any });

  window.__hydrate = () => {
    console.log('[Hydrate] Starting...');
    hydrateRoot(document.getElementById('root')!, router);
    console.log('[Hydrate] Complete');
  };

  window.addEventListener('load', () => window.__hydrate?.());
}
```

**`ui/my-app/src/routes/index.tsx`**
```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to everything.dev</h1>
        <p className="text-muted-foreground mb-6">
          A type-driven framework for composable modules
        </p>
        <a href="/login" className="text-primary hover:underline">
          Get Started →
        </a>
      </div>
    </div>
  );
}
```

**`ui/my-app/src/routes/login.tsx`**
```typescript
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (localStorage.getItem('session')) {
      throw redirect({ to: '/' });
    }
  },
  component: Login,
});

function Login() {
  const config = (window as any).__RUNTIME_CONFIG__ || {};
  const account = config.account || 'every.near';

  const handleClick = () => {
    console.log('[Login] Connect to:', account);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Login</h1>
        <button onClick={handleClick} className="px-6 py-3 bg-primary rounded">
          Connect Wallet ({account})
        </button>
      </div>
    </div>
  );
}
```

**`ui/my-app/rsbuild.config.ts`**
```typescript
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { TanStackRouterRspack } from '@tanstack/router-plugin/rspack';
import { withZephyr } from 'zephyr-rsbuild-plugin';

const shouldDeploy = process.env.DEPLOY === 'true';

export default defineConfig({
  plugins: [
    pluginReact(),
    TanStackRouterRspack(),

    pluginModuleFederation({
      name: 'my-ui',
      filename: 'remoteEntry.js',
      exposes: {
        './Router': './src/router.tsx',
        './Hydrate': './src/hydrate.tsx',
        './everything-dev': './src/everything-dev.ts',
        './remote': './src/remote/index.ts',
        './components': './src/components/index.ts',
        './hooks': './src/hooks/index.ts',
      },
      shared: {
        react: { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
      },
    }),

    ...(shouldDeploy ? [withZephyr({ hooks: { onDeployComplete: (info) => console.log(`Deployed: ${info.url}`) } })] : [])
  ],
});
```

### Develop Locally

```bash
cd ui/my-app
npm install
everything-dev dev local

# Visit http://localhost:3000/
# Visit http://localhost:3000/login
```

### Deploy UI + SSR

```bash
cd ui/my-app

# Deploy client
BUILD_TARGET=client DEPLOY=true npm run build

# Deploy SSR
BUILD_TARGET=server DEPLOY=true npm run build
```

## Example 3: Host Application

Create host that mounts remote UI and API plugins.

### Scaffold Host

```bash
everything-dev add host --template minimal

# Manual setup
mkdir -p host-minimal/src
cd host-minimal
npm init -y
npm install everything-plugin
npm install everything-plugin/effect everything-plugin/zod
npm install @hono/node-server hono
npm install --save-dev rsbuild @module-federation/rsbuild-plugin
npm install everything-dev
```

### Create Files

**`host-minimal/.everything.dev`**
```json
{
  "account": "every.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "apps": {
    "api": {
      "remotes": [
        {
          "id": "api-kv",
          "remote": "http://localhost:3002/remoteEntry.js",
          "version": "1.0.0",
          "plugin": "createPlugin",
          "secrets": {
            "KV_DATABASE_URL": "http://localhost:4000",
            "KV_DATABASE_AUTH_TOKEN": "test-token"
          },
          "variables": {}
        }
      ]
    },
    "ui": {
      "remote": "http://localhost:3014/remoteEntry.js",
      "ssr": "http://localhost:3015/remoteEntry.server.js"
    }
  }
}
```

**`host-minimal/src/program.ts`**
```typescript
import { createHost } from 'everything-dev';
import { z } from 'every-plugin/zod';
import { serve } from '@hono/node-server';
import type { Context } from 'hono';

export interface HostConfig {
  account: string;
  env: 'development' | 'production';
  hostUrl: string;
  ui: {
    url: string;
    ssrUrl: string;
  };
  api: {
    remotes: Array<{
      id: string;
      remote: string;
      secrets: Record<string, string>;
      variables: Record<string, string>;
    }>;
  };
}

export const host = createHost<HostConfig>({
  configSchema: z.object({
    account: z.string(),
    env: z.enum(['development', 'production']),
    hostUrl: z.string().url(),
    ui: z.object({
      url: z.string().url(),
      ssrUrl: z.string().url(),
    }),
    api: z.object({
      remotes: z.array(z.object({
        id: z.string(),
        remote: z.string().url(),
        secrets: z.record(z.string()),
        variables: z.record(z.string()),
      })),
    }),
  }),

  useUi: (config) => ({
    remote: config.ui.url,
    ssr: config.ui.ssrUrl,
    loads: ['router', 'hydrate'],
    runtimeConfig: {
      env: config.env,
      account: config.account,
      assetsUrl: config.ui.url,
      apiBase: '/api',
      rpcBase: '/api/rpc',
    },
  }),

  useApi: (config) => ({
    plugins: config.api.remotes,
  }),

  createServerHandlers: (modules) => ({
    api: modules.api.router,
    ui: modules.ui.router,
    openapi: modules.api.openapi,
  }),

  injectRuntimeConfig: (html, config) => {
    const script = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(config)}</script>`;
    return html.replace('</head>', `${script}</head>`);
  },
});

export const runServer = async () => {
  const app = createHono();

  app.get('/health', (c: Context) => c.text('OK'));

  const modules = await host.mount({
    config: {
      account: 'every.near',
      env: 'development',
      hostUrl: 'http://localhost:3000',
      ui: {
        url: 'http://localhost:3014',
        ssrUrl: 'http://localhost:3015',
      },
      api: {
        remotes: [
          {
            id: 'api-kv',
            remote: 'http://localhost:3002',
            secrets: { KV_DATABASE_URL: 'http://localhost:4000', KV_DATABASE_AUTH_TOKEN: 'test' },
            variables: {},
          },
        ],
      },
    },
  });

  app.all('/api/*', async (c: Context) => {
    const request = c.req.raw;
    const response = await modules.api.router(request);
    return c.newResponse(response.body, response);
  });

  app.all('*', async (c: Context) => {
    const request = c.req.raw;
    const result = await modules.ui.router.renderToStream(request, {
      runtimeConfig: {
        env: 'development',
        account: 'every.near',
        assetsUrl: 'http://localhost:3014',
        apiBase: '/api',
        rpcBase: '/api/rpc',
      },
    });
    return c.newResponse(result.stream, { status: result.statusCode, headers: result.headers });
  });

  await serve({ fetch: app.fetch, port: 3000 });
  console.log('Server running at http://localhost:3000');
};

if (import.meta.main) {
  runServer();
}
```

**`host-minimal/rsbuild.config.ts`**
```typescript
import { defineConfig } from '@rsbuild/core';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

export default defineConfig({
  plugins: [
    pluginModuleFederation({
      name: 'host',
      filename: 'remoteEntry.js',
      exposes: {
        './Server': './src/program.ts',
      },
    }),
  ],
});
```

### Develop Locally

```bash
# Start API plugin
cd plugins/api-kv
everything-dev dev local

# Start UI
cd ui/my-app
everything-dev dev local

# Start host
cd host-minimal
bun run src/program.ts

# Visit http://localhost:3000/
```

## Example 4: Complete Workflow

Full development-to-deployment workflow.

### Setup

```bash
# 1. Create project structure
mkdir everything-dev-demo
cd everything-dev-demo
npm init -y

# 2. Add everything-dev CLI
npm install --save-dev @everything-dev/cli

# 3. Add plugin
everything-dev add plugin api-kv --template kv-storage

# 4. Add UI
everything-dev add ui my-app --template tanstack

# 5. Add host
everything-dev add host --template minimal
```

### Develop

```bash
# Terminal 1: Start plugin
cd plugins/api-kv
everything-dev dev local

# Terminal 2: Start UI
cd ui/my-app
everything-dev dev local

# Terminal 3: Start host
cd host
everything-dev dev local

# Terminal 4: Test
curl http://localhost:3000/api/ping
curl http://localhost:3000/
```

### Deploy

```bash
# Deploy plugin
cd plugins/api-kv
DEPLOY=true npm run build
# Note URL: https://cdn.zephyr.com/vXXXX/api-kv/remoteEntry.js

# Deploy UI client
cd ../ui/my-app
BUILD_TARGET=client DEPLOY=true npm run build

# Deploy UI SSR
BUILD_TARGET=server DEPLOY=true npm run build

# Deploy host
cd ../host
DEPLOY=true npm run build

# Test production
everything-dev run production
```

## Summary

1. **Create plugin** - `everything-dev add plugin` or manually
2. **Implement contract** - oRPC with Zod schemas
3. **Build service** - Effect-based business logic
4. **Export plugin** - `createPlugin()` with contract, initialize, createRouter
5. **Create UI** - TanStack Router + SSR
6. **Configure host** - `createHost()` with config schema
7. **Mount modules** - useUi, useApi, createServerHandlers
8. **Deploy** - Zephyr uploads, host mounts remotes
9. **Run** - `everything-dev run production`

See **ARCHITECTURE.md** for core concepts, **CLI.md** for commands, **PLUGINS.md**, **UI.md** for implementation details.