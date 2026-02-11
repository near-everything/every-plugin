# UI Modules

UI modules provide server-side rendering (SSR), client hydration, and component exports. They use `createUi()` or export an `everything` object.

## Overview

### UI Structure

```
ui/my-app/
├── src/
│   ├── routes/
│   │   ├── index.tsx       # Home
│   │   └── login.tsx       # Login
│   ├── router.tsx          # Client router
│   ├── router.server.tsx   # SSR router
│   ├── hydrate.tsx         # Client hydrator
│   ├── everything-dev.ts   # Export everything object
│   ├── components/         # Shared components
│   └── hooks/              # Shared hooks
├── package.json
├── tsconfig.json
├── rsbuild.config.ts
├── postcss.config.mjs
└── README.md
```

## everything Export

The `everything` object declares SSR capabilities, client hydration, and component exports:

```typescript
// src/everything-dev.ts
import type { EverythingUiModule } from 'everything-dev/ui';
import { renderToStream } from './router.server';

export const everything: EverythingUiModule = {
  // SSR configuration
  ssr: {
    router: './src/router.server.tsx',
    renderToStream: async (request, options) => {
      const stream = await renderRouterToStream({ ... });
      const html = await streamToString(stream);
      const injected = injectRuntimeConfig(html, options.runtimeConfig);
      return {
        stream: stringToStream(injected),
        statusCode: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
      };
    }
  },

  // Client hydration
  client: {
    hydrate: './src/hydrate.tsx',
  },

  // Exposed components
  exposedComponents: {
    Button: './src/components/button.tsx',
    Card: './src/components/card.tsx',
    Input: './src/components/input.tsx',
  },

  // Exposed hooks
  exposedHooks: {
    useAuth: './src/hooks/use-auth.ts',
    useQuery: './src/hooks/use-query.ts',
  },

  // Routes for SSR
  exposedRoutes: [
    { path: '/', title: 'Home' },
    { path: '/login', title: 'Login', requiresAuth: true },
  ],

  // Capabilities
  capabilities: ['ssr', 'hydration', 'routing'],
};
```

## SSR Configuration

### renderToStream Signature

```typescript
type RenderToStream = (
  request: Request,
  options: { runtimeConfig: RuntimeConfig }
) => Promise<{
  stream: ReadableStream;
  statusCode: number;
  headers: Headers;
}>;
```

### Implementation

```typescript
// src/router.server.tsx
import { renderRouterToStream } from '@tanstack/react-router/ssr/server';

export async function renderToStream(
  request: Request,
  options: { runtimeConfig: RuntimeConfig },
): Promise<{
  stream: ReadableStream;
  statusCode: number;
  headers: Headers;
}> {
  const url = new URL(request.url);
  const history = createMemoryHistory({
    initialEntries: [url.pathname + url.search],
  });

  const handler = createRequestHandler({
    request,
    createRouter: () => {
      const router = createRouter({ history });
      return router;
    },
  });

  const requestResponse = await handler(async ({ request, responseHeaders, router }) => {
    const streamPromise = renderRouterToStream({
      request,
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    });

    const response = await streamPromise;

    // Read stream to string
    const html = await streamToString(response.body!);

    // Inject runtime config
    const injectedHtml = html.replace(
      '</head>',
      `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(options.runtimeConfig)}</script></head>`
    );

    return new Response(
      stringToStream(injectedHtml),
      { status: response.status, headers: response.headers }
    );
  });

  return requestResponse;
}

// Helper functions
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

function stringToStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}
```

### Runtime Config

Passed from host to UI:

```typescript
interface RuntimeConfig {
  env: 'development' | 'production';
  account: string;
  assetsUrl: string;
  apiBase: string;
  rpcBase: string;
}
```

Injected as `window.__RUNTIME_CONFIG__` and used in client:

```typescript
// src/hydrate.tsx
if (typeof window !== 'undefined') {
  const config = window.__RUNTIME_CONFIG__;
  console.log('Runtime config:', config);
}
```

## Router Configuration

### TanStack Router

```typescript
// src/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function createRouter(opts: { history: History }) {
  return createTanStackRouter({
    routeTree,
    history: opts.history,
    defaultPreload: 'intent',
    scrollRestoration: true,
  });
}
```

### Routes

```typescript
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return <div>Welcome to everything.dev</div>;
}
```

```typescript
// src/routes/login.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ search }) => {
    const session = await getSession();
    if (session?.user) {
      throw redirect({ to: search.redirect || '/' });
    }
  },
  component: Login,
});

function Login() {
  const handleClick = async () => {
    const account = (window as any).__RUNTIME_CONFIG__?.account || 'every.near';
    // Auth logic here
  };

  return (
    <button onClick={handleClick}>
      Connect Wallet
    </button>
  );
}
```

## Client Hydration

```typescript
// src/hydrate.tsx
import { hydrateRoot } from 'react-dom/client';
import { createRouter } from './router';

if (typeof window !== 'undefined') {
  const config = window.__RUNTIME_CONFIG__;
  console.log('[Hydrate] Runtime config:', config);

  const router = createRouter({
    history: window.history as any,
  });

  (window as any).__hydrate = () => {
    console.log('[Hydrate] Starting hydration...');
    hydrateRoot(document.getElementById('root')!, router);
    console.log('[Hydrate] Hydration complete');
  };

  // Auto-hydrate if not delayed
  if (!config?.delayHydration) {
    window.addEventListener('load', () => window.__hydrate?.());
  }
}
```

## Component Exports

### Button Component

```typescript
// src/components/button.tsx
import { forwardRef } from 'react';

export const Button = forwardRef<HTMLButtonElement, {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}>(function Button({ children, onClick, variant = 'primary' }, ref) {
  const base = 'px-4 py-2 rounded font-medium transition-colors';

  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
});
```

### Card Component

```typescript
// src/components/card.tsx
export function Card({ children, className }: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card text-card-foreground rounded-lg shadow ${className}`}>
      {children}
    </div>
  );
}
```

## Hooks Exports

### useAuth Hook

```typescript
// src/hooks/use-auth.ts
export function useAuth() {
  const config = (window as any).__RUNTIME_CONFIG__ || {};

  const signIn = async () => {
    console.log('[useAuth] Sign in to:', config.account);
    // Implement auth logic
  };

  const signOut = async () => {
    console.log('[useAuth] Sign out');
    // Implement auth logic
  };

  return { signIn, signOut, account: config.account };
}
```

### useQuery Hook

```typescript
// src/hooks/use-query.ts
export function useQuery<T>(key: string[], fn: () => Promise<T>) {
  return useTanStackQuery({
    queryKey: key,
    queryFn: fn,
  });
}
```

## Module Federation Config

### UI Build (Client)

```typescript
// rsbuild.config.ts
const shouldDeploy = process.env.DEPLOY === 'true';

export default defineConfig({
  plugins: [
    pluginReact(),

    pluginModuleFederation({
      name: 'my-ui',
      filename: 'remoteEntry.js',
      exposes: {
        './Router': './src/router.tsx',
        './Hydrate': './src/hydrate.tsx',
        './remote': './src/remote/index.ts',
        './components': './src/components/index.ts',
        './hooks': './src/hooks/index.ts',
      },
      shared: {
        react: { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
        '@tanstack/react-router': { singleton: true, eager: true },
        // ... more shared deps
      },
    }),

    ...(shouldDeploy ? [withZephyr({ ... })] : []),
  ],
});
```

### SSR Build (Server)

```typescript
// rsbuild.config.ts (BUILD_TARGET=server)
export default defineConfig({
  plugins: [
    pluginReact(),

    new ModuleFederationPlugin({
      name: 'my-ui',
      filename: 'remoteEntry.server.js',
      runtimePlugins: [require.resolve('@module-federation/node/runtimePlugin')],
      library: { type: 'commonjs-module' },
      exposes: { './Router': './src/router.server.tsx' },
    }),
  ],
  tools: {
    rspack: {
      target: 'async-node',
      externals: [/^node:/],
    },
  },
});
```

## Build Scripts

```json
// package.json
{
  "scripts": {
    "dev": "rsbuild dev",
    "build": "bun run build:client && bun run build:ssr",
    "build:client": "BUILD_TARGET=client rsbuild build",
    "build:ssr": "BUILD_TARGET=server rsbuild build",
    "deploy": "DEPLOY=true bun run build"
  }
}
```

## Deployment

### Client UI

```bash
BUILD_TARGET=client DEPLOY=true rsbuild build
# → uploads dist/remoteEntry.js to Zephyr
# → updates .everything.dev.apps.ui.remote
```

### SSR

```bash
BUILD_TARGET=server DEPLOY=true rsbuild build
# → uploads dist/remoteEntry.server.js to Zephyr
# → updates .everything.dev.apps.ui.ssr
```

## Usage in Host

```typescript
// Host uses UI SSR
const { renderToStream, statusCode, headers } = await uiRouter.renderToStream(
  new Request('http://localhost:3000/login'),
  { runtimeConfig }
);

return new Response(renderToStream, { status: statusCode, headers });
```

## Best Practices

1. **Read full stream to string** - Then inject, then return (no chunked streaming)
2. **Validate runtime config** - Use Zod on host, trust on client
3. **Expose minimal components** - Only share what's needed
4. **Keep SSR simple** - Avoid complex streaming logic
5. **Use TanStack Router** - Built-in SSR support
6. **Test hydration locally** - Use `everything-dev dev local`

## Complete Example: TanStack Router UI

```typescript
// src/everything-dev.ts
import type { EverythingUiModule } from 'everything-dev/ui';
import { renderToStream } from './router.server';

export const everything: EverythingUiModule = {
  ssr: {
    router: './src/router.server.tsx',
    renderToStream: async (request, options) => {
      const stream = await renderRouterToStream({
        request: new URL(request.url).pathname + new URL(request.url).search,
        config: { assetsUrl: options.runtimeConfig.assetsUrl },
      });

      const html = await streamToString(stream.body!);
      const injected = html.replace(
        '</head>',
        `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(options.runtimeConfig)};window.addEventListener('load',()=>window.__hydrate?.())</script></head>`
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

  exposedHooks: {
    useAuth: './src/hooks/use-auth.ts',
  },

  exposedRoutes: [
    { path: '/', title: 'Home' },
    { path: '/login', title: 'Login' },
  ],

  capabilities: ['ssr', 'hydration', 'routing'],
};
```

See **CLI.md** for `add ui` command and **EXAMPLES.md** for complete workflows.