# Skill: Adding and Building Plugins and UI

This skill provides guidance for developers new to everything.dev on how to create, develop, and deploy plugins and UI modules.

## Overview

everything.dev makes it easy to create remote modules via CLI commands:

```bash
# Add a new plugin
everything-dev add plugin <name> [--template]

# Add a new UI
everything-dev add ui <name> [--template]

# Develop locally
everything-dev dev <config>

# Deploy to Zephyr
everything-dev deploy

# Run in production
everything-dev run <config>
```

## Creating a Plugin

### Step-by-Step

1. **Choose a template:**
   - `empty` - Minimal scaffold
   - `kv-storage` - Key-value storage
   - `http-api` - HTTP client wrapper
   - `webhook` - Webhook receiver
   - `streaming` - Streaming data source

2. **Create the plugin:**
   ```bash
   everything-dev add plugin my-plugin --template kv-storage
   ```

3. **Review generated structure:**
   ```
   plugins/my-plugin/
   ├── src/
   │   ├── contract.ts       # oRPC contract (API definition)
   │   ├── service.ts        # Service class (business logic)
   │   ├── index.ts          # createPlugin() export
   │   └── __tests__/        # Tests
   ├── package.json
   ├── rsbuild.config.ts
   └── README.md
   ```

4. **Define your contract:**
   ```typescript
   // src/contract.ts
   import { oc } from 'every-plugin/orpc';
   import { z } from 'every-plugin/zod';

   export const contract = oc.router({
     ping: oc
       .route({ method: 'GET', path: '/ping' })
       .output(z.object({ status: z.literal('ok') }))
       .tags(['health']),

     myEndpoint: oc
       .route({ method: 'GET', path: '/data' })
       .input(z.object({ id: z.string() }))
       .output(z.object({ data: z.object({ id: z.string(), value: z.string() }) })),   ```

5. **Implement service:**
   ```typescript
   // src/service.ts
   class MyService {
     async getData(id: string) {
       const response = await fetch(`https://api.example.com/${id}`);
       return await response.json();
     }
   }

   export { MyService };
   ```

6. **Create plugin:**
   ```typescript
   // src/index.ts
   import { createPlugin } from 'everything-plugin';
   import { Effect } from 'everything-plugin/effect';
   import { contract } from './contract';
   import { MyService } from './service';

   export default createPlugin({
     variables: z.object({}),
     secrets: z.object({ API_KEY: z.string() }),
     contract,

     initialize: (config) => Effect.gen(function* () {
       const service = new MyService(config.secrets.API_KEY);
       return { service };
     }),

     createRouter: ({ service }, builder) => ({
       ping: builder.ping.handler(async () => ({ status: 'ok' })),

       myEndpoint: builder.getData.handler(async ({ input }) => {
         const data = await Effect.runPromise(service.getData(input.id));
         return { data };
       }),
     }),
   });
   ```

7. **Build and deploy:**
   ```bash
   npm install
   DEPLOY=true npm run build
   ```

## Creating a UI Module

### Step-by-Step

1. **Choose a template:**
   - `empty` - Minimal scaffold
   - `tanstack` - TanStack Router + Query

2. **Create the UI:**
   ```bash
   everything-dev add ui my-app --template tanstack
   ```

3. **Review generated structure:**
   ```
   ui/my-app/
   ├── src/
   │   ├── routes/
   │   │   ├── index.tsx      # Home
   │   │   └── login.tsx      # Login
   │   ├── router.tsx         # Client router
   │   ├── router.server.tsx  # SSR router
   │   ├── hydrate.tsx        # Client hydrator
   │   ├── everything-dev.ts  # Export everything object
   │   ├── components/        # Shared components
   │   └── hooks/             # Shared hooks
   ├── package.json
   ├── rsbuild.config.ts
   └── README.md
   ```

4. **Configure everything export:**
   ```typescript
   // src/everything-dev.ts
   import type { EverythingUiModule } from 'everything-dev/ui';

   export const everything: EverythingUiModule = {
     ssr: {
       router: './src/router.server.tsx',
       renderToStream: async (request, options) => {
         // Read stream to string
         // Inject runtime config
         // Return as stream
         return {
           stream: ...,
           statusCode: 200,
           headers: ...,
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

5. **Define routes:**
   ```typescript
   // src/routes/index.tsx
   import { createFileRoute } from '@tanstack/react-router';

   export const Route = createFileRoute('/')({
     component: Home,
   });

   function Home() {
     return <h1>Welcome</h1>;
   }
   ```

6. **Implement SSR:**
   ```typescript
   // src/router.server.tsx
   export async function renderToStream({
     pathname,
     runtimeConfig,
   }: {
     pathname: string;
     runtimeConfig: unknown;
   }) {
     const stream = await renderRouterToStream({ pathname });
     const html = await streamToString(stream);

     // Inject runtime config
     const injected = html.replace(
      '</head>',
     `<script>window.__RUNTIME_CONFIG__=${JSON.stringify(runtimeConfig)}</script></head>`
    );

    return stringToStream(injected);
   }
   ```

7. **Build and deploy:**
   ```bash
   npm install

   # Deploy client
   BUILD_TARGET=client DEPLOY=true npm run build

   # Deploy SSR
   BUILD_TARGET=server DEPLOY=true npm run build
   ```

## Local Development

### Setup

```bash
# Install packages
cd plugins/my-plugin && npm install
cd ../ui/my-app && npm install
cd ../host && npm install
```

### Start all services

```bash
# Terminal 1: Plugin
cd plugins/my-plugin
everything-dev dev local

# Terminal 2: UI
cd ../ui/my-app
everything-dev dev local

# Terminal 3: Host
cd ../host
everything-dev dev local

# Test
curl http://localhost:3000/api/ping
curl http://localhost:3000/
curl http://localhost:3000/login
```

## Deployment

### Deploy to Zephyr

```bash
# Deploy plugin
cd plugins/my-plugin
DEPLOY=true npm run build

# Note URL: https://cdn.zephyr.com/vXXXX/plugin/remoteEntry.js

# Deploy UI client
cd ../ui/my-app
BUILD_TARGET=client DEPLOY=true npm run build

# Deploy UI SSR
BUILD_TARGET=server DEPLOY=true npm run build

# Deploy host
cd ../host
DEPLOY=true npm run build
```

### Update .everything.dev

Zephyr hooks automatically update config:

```json
{
  "apps": {
    "api": {
      "remotes": [{
        "id": "my-plugin",
        "remote": "https://cdn.zephyr.com/vXXXX/plugin/remoteEntry.js"
      }]
    },
    "ui": {
      "remote": "https://cdn.zephyr.com/vYYYY/ui/remoteEntry.js",
      "ssr": "https://cdn.zephyr.com/vZZZZ/ui-ssr/remoteEntry.server.js"
    }
  }
}
```

## Testing

### Plugin Tests

```typescript
// src/__tests__/index.test.ts
import { describe, it, expect } from 'vitest';
import MyPlugin from '../index';

describe('MyPlugin', () => {
  it('should create router', async () => {
    const PluginClass = MyPlugin as any;
    const plugin = new PluginClass();
    const router = plugin.createRouter({}, {} as any);
    expect(router).toBeDefined();
  });
});
```

### Run tests

```bash
cd plugins/my-plugin
vitest

# Or with coverage
vitest --coverage
```

## Troubleshooting

### Build fails

```bash
# Check tsconfig
cat tsconfig.json

# Check build
rsbuild build --stats

# Fix errors
```

### Plugin not loading

```bash
# Check host logs
everything-dev dev --log-level debug

# Check remote URL
curl https://cdn.zephyr.com/vXXXX/plugin/remoteEntry.js

# Verify exports
curl https://cdn.zephyr.com/vXXXX/plugin/remoteEntry.js | head
```

### SSR not working

```bash
# Check SSR build
BUILD_TARGET=server rsbuild build

# Test SSR endpoint
curl -X POST http://localhost:3015/ssr \
  -H "Content-Type: application/json" \
  -d '{"pathname": "/"}'

# Check host logs
everything-dev dev --log-level debug
```

## Best Practices

1. **Start with templates** - Use scaffolding to save time
2. **Type everything** - Use Zod for validation
3. **Test locally first** - Use `dev` mode before deploying
4. **Deploy frequently** - Small changes deploy faster
5. **Monitor build size** - Large bundles slow down loading
6. **Keep shared deps in sync** - Update all modules together
7. **Use semantic versioning** - Track breaking changes

## Next Steps

- Read **[ARCHITECTURE.md](./ARCHITECTURE.md)** for core concepts
- Read **[CLI.md](./CLI.md)** for all commands
- Read **[PLUGINS.md](./PLUGINS.md)** for plugin patterns
- Read **[UI.md](./UI.md)** for UI patterns
- Read **[EXAMPLES.md](./EXAMPLES.md)** for complete workflows