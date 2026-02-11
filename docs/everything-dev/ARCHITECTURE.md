████████
            ██████████████████████████████
       ████████████████████████████████████████
     ████████████████████████████████████████████
    ████████████████████████████████████████████████
     ████████████████████████████████████████████████
      ████████████████████████████████████████████████
    ████████████████████████████████████████████████████
             ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
          ░░░░███████████████████████████████████████
            ░░░░███████████████████████████████████
             ░░░░███████████████████████████████████
                ░███████████████████████████████
                   ██████████████████████████
                     ████████████████████
                        █████████
                          ▀▀▀▀


                              everything.dev


                     A Type-Driven Framework
                for Composable Remote Modules


================================================================================
                            ARCHITECTURE
================================================================================

everything.dev is a minimal, type-driven framework for building composable
applications with remote modules. It replaces complex manual configuration
with a simple account/domain/api/ui pattern and declarative CLI commands.

## Core Principles

### 1. Account / Domain Pattern
```
account (every.near)
  └─ domain (everything.dev)
       ├─ api (remotes: [my-plugin, your-plugin])
       │   └─ plugins (createPlugin, contract, service)
       └─ ui (remote, ssr, exposes)
           ├─ SSR router
           ├─ Hydrator
           └─ Components/Hooks
```

### 2. The .everything.dev File
Like `.env` for runtime, `.everything.dev` handles deployment config:

```json
{
  "account": "every.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "apps": {
    "host": {
      "name": "my-host",
      "type": "host",
      "remote": "https://cdn.zephyr.com/v1234/host/remoteEntry.js"
    },
    "ui": {
      "name": "front-end",
      "type": "ui",
      "remote": "https://cdn.zephyr.com/v2090/ui/remoteEntry.js",
      "ssr": "https://cdn.zephyr.com/v2091/ui-ssr/remoteEntry.server.js"
    },
    "api": {
      "name": "api",
      "type": "api",
      "remote": "https://cdn.zephyr.com/v2092/api/remoteEntry.js",
      "secrets": ["API_DATABASE_URL", "API_DATABASE_AUTH_TOKEN"]
    },
    "worker": {
      "name": "background-worker",
      "type": "worker",
      "remote": "https://cdn.zephyr.com/v2093/worker/remoteEntry.js"
    }
  }
}
```

### 3. createHost() Pattern

The core API for orchestrating remote modules in host applications:

```typescript
import { createHost } from 'everything-dev';
import { z } from 'every-plugin/zod';

export interface HostConfig {
  account: string;
  env: 'development' | 'production';
  hostUrl: string;
  ui: {
    url: string;
    ssr: string;
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
      ssr: z.string().url(),
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
    runtimeConfig: {
      env: config.env,
      account: config.account,
      assetsUrl: config.ui.url,
      apiBase: '/api',
      rpcBase: '/api/rpc',
    }
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
    const script = `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(config)};window.addEventListener('load',()=>window.__hydrate?.())</script>`;
    return html.replace('</head>', `${script}</head>`);
  },
});

export const run = (config: HostConfig) => host.run({ config });
```

### 4. Type-Safe Plugin Composition

#### API Plugins (createPlugin)

```typescript
import { createPlugin } from 'every-plugin';
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

const contract = oc.router({
  ping: oc.route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') })),
  getValue: oc.route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ value: z.string().nullable() })),
});

export default createPlugin({
  variables: z.object({}),
  secrets: z.object({ API_DATABASE_URL: z.string() }),
  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const dbUrl = config.secrets.API_DATABASE_URL;
      console.log('[API] Connecting to:', dbUrl);
      const services = yield* createServices(dbUrl);
      return services;
    }),

  createRouter: ({ services }) => ({
    ping: builder.ping.handler(async () => ({ status: 'ok' })),
    getValue: builder.getValue.handler(async ({ input }) => {
      const value = await services.getValue(input.key);
      return { value };
    }),
  }),
});
```

#### UI Modules (everything export)

```typescript
import type { EverythingUiModule } from 'everything-dev/ui';

export const everything: EverythingUiModule = {
  ssr: {
    router: './src/router.server.tsx',
    renderToStream: async (request, options) => {
      const stream = await renderRouterToStream({ request });
      const html = await streamToString(stream);

      const injectedHtml = html.replace(
        '</head>',
        `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(options.runtimeConfig)}</script></head>`
      );

      return {
        stream: stringToStream(injectedHtml),
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

  exposedHooks: {
    useAuth: './src/hooks/use-auth.ts',
    useQuery: './src/hooks/use-query.ts',
  },

  exposedRoutes: [
    { path: '/', title: 'Home' },
    { path: '/login', title: 'Login' },
  ],

  capabilities: ['ssr', 'hydration', 'routing'],
};

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

function stringToStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}
```

## Key Design Decisions

### SSR Runtime Config Injection

**Simple Approach (No Complex Streaming):**
```typescript
// Read entire stream to string
const html = await streamToString(stream);

// Inject runtime config
const injected = html.replace(
  '</head>',
  `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(config)}</script></head>`
);

// Return as stream
return stringToStream(injected);
```

**Why This Work Better:**
- No complex buffer handling
- No chunked stream transformation
- More reliable hydration
- Easier to debug
- Type-safe config validation

## CLI as Composable Plugin

The CLI itself can be used as a remote module:

```typescript
// everything-dev CLI exposes contract
import { cliContract } from '@everything-dev/contract';

// Host can spawn CLI processes
const runtime = createPluginRuntime({
  registry: {
    cli: { module: EverythingDevCLI }
  }
});

// Call CLI commands from other tools
const cli = await runtime.usePlugin('cli');
await cli.createClient().spawnProcess({ appKey: 'ui', command: 'dev' });
```

## OpenAPI Auto-Generation

Contracts automatically generate OpenAPI specs:

```typescript
const contract = oc.router({
  ping: oc.route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .tags(['health'])  // Group routes with tags
    .summary('Health check')
    .description('Returns OK if service is healthy'),

  getValue: oc.route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ value: z.string().nullable() }))
    .tags(['kv'])
    .errors(CommonPluginErrors),  // Standard error schemas
});
```

Host aggregates all plugin contracts and publishes `/api/openapi.json` automatically.

## Type-Safe API Client in UI

```typescript
// Import contract from API plugin
import type { contract } from '../api/src/contract';

// Create typed router client
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

export type ApiContract = typeof contract;
export type ApiClient = ContractRouterClient<ApiContract>;

function createApiLink() {
  return new RPCLink({
    url: '/api/rpc',
    interceptors: [onError((error) => console.error('oRPC Error:', error))],
    fetch(url, options) => fetch(url, { ...options, credentials: 'include' }),
  });
}

// Create client-side API client
function createClientSideApiClient(): ApiClient {
  return createORPCClient(createApiLink());
}

// Global client shared between server and client
declare global { var $apiClient: ApiClient | undefined; }

export const apiClient =
  globalThis.$apiClient ?? createClientSideApiClient();

// Usage in components:
import { apiClient } from './remote/orpc';

const result = await apiClient.ping();
const data = await apiClient.listKeys({ limit: 10 });
```

## Module Federation Internal Handling

Framework handles federation internally - no need for `setGlobalFederationInstance()`:

```typescript
// OLD (everything-plugin - manual)
const instance = createInstance({ ... });
setGlobalFederationInstance(instance);

// NEW (everything.dev - automatic)
createHost({ config }).mount();  // Framework handles it
```

Framework reads `everything` export, auto-creates instance, registers remotes, handles loading.

## Document References

Read these next to understand each part of the framework:

- **[CLI.md](./CLI.md)** - Commands: run, dev, build, deploy, add plugin, add ui
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Zephyr hooks, Module Federation, build types
- **[PLUGINS.md](./PLUGINS.md)** - createPlugin() patterns, contracts, services, errors
- **[UI.md](./UI.md)** - SSR patterns, hydration, component exports
- **[OPENAPI.md](./OPENAPI.md)** - Spec generation, contracts, documentation
- **[EXAMPLES.md](./EXAMPLES.md)** - End-to-end workflows, complete demos

## Migration Path

| Feature | everything-plugin | everything-dev |
|---------|------------------|--------------|
| Config | bos.config.json | .everything.dev |
| CLI | bos start/dev | everything-dev run/dev |
| Federation | Manual setGlobalFederationInstance | Handled by framework |
| SSR | Complex stream transform | Simple string injection |
| Plugins | Only createPlugin() | createPlugin() + everything export |
| OpenAPI | Manual setup | Auto-generated from contracts |
| Account/Domains | No concepts | Native support |