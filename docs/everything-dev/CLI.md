# everything.dev CLI

The everything-dev CLI provides commands for developing, deploying, and managing remote modules.

## Installation

```bash
npm install -g @everything-dev/cli
# or
bun add -g @everything-dev/cli
```

## Quick Start

```bash
# Install CLI
npm install -g @everything-dev/cli

# Run host with all apps (auto-detects local/remote)
everything-dev run production

# Develop local apps (auto-detects which exist)
everything-dev dev local

# Add new modules
everything-dev add plugin my-plugin --template kv-storage
everything-dev add ui my-app --template tanstack

# Deploy all modules
everything-dev deploy
```

## Commands Overview

| Command | Description |
|---------|-------------|
| `run <config>` | Start production server with remote modules |
| `dev <config>` | Start development server with hot reload |
| `build` | Build packages locally |
| `deploy` | Deploy to Zephyr CDN |
| `add plugin` | Create new API plugin scaffold |
| `add ui` | Create new UI module scaffold |
| `list` | List local and remote apps |
| `status` | Check app health endpoints |

## Run

Start a production host with remote modules.

```bash
# Run with .everything.dev in current directory
everything-dev run production

# Run with named config
everything-dev run my-app

# Run with config path
everything-dev run ./configs/.everything-dev.staging

# Override environment
NODE_ENV=production everything-dev run production
```

### What it does

1. Reads `.everything.dev` configuration file
2. Loads `createHost()` from `src/program.ts` (or configured entry)
3. Auto-detects local apps (key = directory presence)
4. Falls back to remote modules if directory doesn't exist
5. Instantiates plugins with variables/secrets from `.env`
6. Starts HTTP server on configured port (default: 3000)
7. Runs SSR routes and API endpoints
8. Logs health and status

### Example Output

```
══════════════════════════════════════════════════════════════
                      everything.dev CLI v0.1.0
══════════════════════════════════════════════════════════════

[HOST] Loading host from https://cdn.zephyr.com/v1234/host/remoteEntry.js...
[HOST] → Host loaded successfully

[UI] Loading SSR from https://cdn.zephyr.com/v2091/ui-ssr/remoteEntry.server.js...
[UI] → SSR ready

[API] Loading plugins...
[API] → Registering: api-kv (https://cdn.zephyr.com/v2092/api/remoteEntry.js)
[API] → Loaded: api-kv

[SERVER] → Starting http://0.0.0.0:3000
[SERVER]      http://0.0.0.0:3000/api     → REST API (OpenAPI docs)
[SERVER]      http://0.0.0.0:3000/api/rpc → RPC endpoint

✓ ready :3000
══════════════════════════════════════════════════════════════
```

## Dev

Start development server with hot reload and watch mode.

```bash
# Start dev server with default config
everything-dev dev

# Start with specific config
everything-dev dev my-app

# Override mode for specific apps
everything-dev dev --mode ui:remote api:local
```

### What it does

1. Checks which apps exist locally
2. Auto-detects missing apps and suggests remote mode
3. Starts local processes for existing apps (read from package.json scripts)
4. Watches for file changes and hot reloads on change
5. Provides error feedback in console

### Auto-Detection Example

```bash
$ everything-dev dev
[CONFIG] Checking local packages...

# Local apps exist
[LOCAL] ✓ host found at ./host
[LOCAL] ✓ ui found at ./ui
[LOCAL] ✗ api not found → will use remote

[AUTO] api: Using remote from https://cdn.zephyr.com/v2092/api/remoteEntry.js

[STARTUP] Starting in order:
  1. host (local) → bun run dev
  2. ui (local) → bun run dev
   3. api (remote) → usePlugin from remote

[PROC] 🟦 host  → Started at localhost:3000
[PROC] 🟢 ui    → Started at localhost:3002
[PROC] 🔵 api    → Loaded from remote

✓ All apps running
```

## Local vs Remote Mode

### Auto-Detection Rules

```bash
everything-dev dev

# Checks each app in .everything.dev:
# 1. If app.directory exists locally → local mode
# 2. If directory doesn't exist but app.remote.url present → remote mode
# 3. If neither exists → error

# Override manually:
everything-dev dev --mode ui:remote api:local
```

### Config for Local App Defaults

```json
{
  "apps": {
    "ui": {
      "name": "front-end",
      "type": "ui",
      "local": {
        "directory": "ui",              // Optional: defaults to key name
        "commands": {
          "build:client": ["bun", "run", "build:client"],
          "build:ssr": ["bun", "run", "build:ssr"],
          "dev": ["bun", "run", "dev"],
        }
      }
    }
  }
}
```

## Add Plugin

Scaffold a new API plugin with full structure.

```bash
# Create plugin with KV storage template
everything-dev add plugin my-kv --template kv-storage

# Scaffold in ./plugins/my-kv/
everything-dev add plugin ./plugins/my-kv

# Or custom location
everything-dev add plugin my-plugin --template http-api
```

### Generated Structure

```
plugins/my-kv/
├── src/
│   ├── contract.ts       # oRPC contract (API definition)
│   ├── service.ts        # Service class (business logic)
│   ├── index.ts          # createPlugin() export
│   └── __tests__/        # Tests
├── package.json
├── rsbuild.config.ts
├── vitest.config.ts
└── README.md
```

### Available Templates

| Template | Description |
|----------|-------------|
| `empty` | Minimal scaffold |
| `kv-storage` | Key-value storage plugin |
| `http-api` | HTTP client wrapper |
| `webhook` | Webhook receiver |
| `streaming` | Streaming data source |

## Add UI

Scaffold a new UI module with SSR and hydration.

```bash
# Create UI module
everything-dev add ui my-app --template tanstack

# Scaffold in ./ui/my-app/
everything-dev add ui ./ui/my-app

# Or custom location
everything-dev add ui admin-panel --template simple
```

### Generated Structure

```
ui/my-app/
├── src/
│   ├── routes/
│   │   ├── index.tsx      # Home
│   │   └── login.tsx      # Login
│   ├── router.tsx         # Client router
│   ├── router.server.tsx  # SSR router
│   ├── hydrate.tsx        # Client hydrator
│   ├── everything-dev.ts   # Export everything object
│   ├── components/        # Shared components
│   └── hooks/             # Shared hooks
├── package.json
├── rsbuild.config.ts
└── README.md
```

### Available Templates

| Template | Description |
|----------|-------------|
| `empty` | Minimal scaffold |
| `tanstack` | TanStack Router + Query (recommended) |
| `simple` | Simple routing only |

## Build

Build packages locally for deployment.

```bash
# Build all apps (auto-detects which exist)
everything-dev build --all

# Build specific apps
everything-dev build ui api

# Build and deploy (one step)
everything-dev build --deploy

# Force rebuild (ignore cache)
everything-dev build --force
```

### Build Process

```bash
# For local apps:
ui/   → BUILD_TARGET=client rsbuild build → dist/remoteEntry.js
ui/   → BUILD_TARGET=server rsbuild build → dist/remoteEntry.server.js
api/  → rsbuild build → dist/remoteEntry.js
host/  → rsbuild build → dist/remoteEntry.js

# Each build uploads to Zephyr CDN automatically
```

### Build Output

```
Building...                 ↑
┌────────────────────┐
│  📦 Build Packages  │
└─────────────────────┘
       │ ↑ ↓ │
┌──────┴───┴───┬────────────────┐
│                     │                 │
│    📦 UI Client        │                 │
│    remoteEntry.js ←┼────────────────┘
│    [2090]             │                 │
│                     │                 │
│    📦 UI SSR           │                 │
│    remoteEntry.server.js ←┤────────────────┤
│    [2091]             │                 │
│                     │                 │
│    📦 API             │                 │
│    remoteEntry.js ←────│─────────────────┘
│    [2092]             │
│                     │
│    📦 Host            │
│    remoteEntry.js ←─┤───────────┘
│    [2093]             │
└─────────────────────┘

Test with: everything-dev run production
```

## Deploy

Deploy apps to Zephyr CDN with automatic config updates.

```bash
# Deploy all apps
everything-dev deploy --all

# Deploy specific apps
everything-dev deploy ui api

# Deploy to staging
everything-dev deploy --env staging
```

### What it does

1. Runs `rsbuild build` for each app type (UI client, UI SSR, API, Host)
2. Uploads to Zephyr Cloud
3. Gets new CDN URL (e.g., `https://cdn.zephyr.com/vXXXX/app/remoteEntry.js`)
4. Updates `.every.dev` with new URLs automatically
5. Prints deployment summary

### Example Output

```
Deploying...
═════════════════════════════════════════════════════════════════

  📦 Building UI Client...
     rsbuild build
     → Output: dist/remoteEntry.js
  ✔️ Uploading to Zephyr...
     🚀 UI Deployed: https://cdn.zephyr.com/v2105/ui/remoteEntry.js
     ✅ Updated .every.dev: apps.ui.remote

  📦 Building UI SSR...
     rsbuild build
     → Output: dist/remoteEntry.server.js
  ✔️ Uploading to ─┬─────────────────────────────────────────────────
     🚀 UI SSR Deployed: https://cdn.zephyr.com/v2106/ui-ssr/remoteEntry.server.js
     ✅ Updated .every.dev: apps.ui.ssr

  📦 Building Host...
     rsbuild build
     → Output: dist/remoteEntry.js
  ✔️ Uploading to Zephyr...
     🚀 Host Deployed: https://cdn.zephyr/v2107/host/remoteEntry.js
     ✅ Updated .every.dev: apps.host.remote

═════════════════════════════════════════════════════════════════

  UI:    https://cdn.zephyr.com/v2105/ui/remoteEntry.js
  SSR:   https://cdn.zephyr.com/v2106/ui-ssr/remoteEntry.server.js
  Host:  https://cdn.zephyr.com/v2107/host/remoteEntry.js

═════════════════════════════════════════════════════════════════

To test production run:
  everything-dev run production

To rebuild and redeploy all:
  everything-dev build --deploy
```

### Zephyr Hooks Integration

```typescript
// rsbuild.config.ts
import { withZephyr } from 'zephyr-rsbuild-plugin';

export default defineConfig({
  plugins: [
    // ... other plugins ...
    withZephyr({
      hooks: {
        onDeployComplete: (info) => {
          console.log(`Deployed: ${info.url}`);
          // Auto-update .every.dev here
          updateEveryDevConfig({ type: 'ui', url: info.url });
        }
      }
    })
  ],
});

export async function updateEveryDevConfig({
  type,
  url,
}: { type: 'ui' | 'api' | 'host', url: string }) {
  const configPath = '.every.dev';
  const config = JSON.parse(await Bun.file(configPath).text());

  if (type === 'ui') {
    if (!config.apps?.ui) config.apps.ui = {};
    config.apps.ui.remote = url;
  } else if (type === 'api') {
    if (!config.apps?.api) config.apps.api = {};
    config.apps.api.remote = url;
  }

  await Bun.write(configPath, JSON.stringify(config, null, 2));
}
```

## List

List all configured apps and their status.

```bash
# List all apps
everything-dev list

# Check specific app status
everything-dev list --app ui

# Check remote module health
everything-dev list --check-health
```

### Example Output

```
═════════════════════════════════════════════════════════════════
  📋 APP STATUS
═══════════════════════════════════════════════════════════════

Local Apps:
  host   🟢 ✓ Running (PID: 1234) at http://localhost:3000
  ui     🟢 ✓ Running (PID: 1235) at http://localhost:3002

Remote Apps:
  api    🔵 🟡 Checking health...
         (Response 200 OK, latency: 45ms)

═══════════════════════════════════════════════════════════════
```

## Status

Check health endpoints of all remote apps.

```bash
# Check all apps
everything-dev status

# Check specific app
everything-dev status --app my-api

# Continuous monitoring
everything-dev status --watch
```

### Example Output

```
═════════════════════════════════════════════════════════════════
  🔍 HEALTH CHECK
═══════════════════════════════════════════════════════════════

Health Check Results:

  api
    URL: https://cdn.zephyr.com/v2092/api/remoteEntry.js
    Health: 🟢 Green (200 OK)
    Latency: 45ms
    Last Check: 2026-02-06 22:15:30

  ui-ssr
    URL: https://cdn.zephyr.com/v2091/ui-ssr/remoteEntry.server.js
    Health: 🟢 Green (200 OK)
    Latency: 38ms
    Last Check: 2026-02-06 22:15:32

═══════════════════════════════════════════════════════════════
```

## Config Discovery

The CLI finds `.every-dev` files in this order:

1. **Current directory**: `./.everything.dev`
2. **Parent traversal**: Walks up to root looking for config
3. **Explicit path**: `everything-dev run ./configs/.everything.dev.staging`
4. **Named config**: `everything-dev run my-app` → `./.everything-dev.my-app`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `BOS_CONFIG_PATH` | Explicit config file path | (none) |
| `PORT` | Server port | `3000` |
| `HOST` | Server hostname | `0.0.0.0` |
| `LOG_LEVEL` | Logging level | `info` |

## CLI as Plugin

The CLI exposes its own router and can be used as a remote module:

```typescript
// Load CLI as plugin
import { createPluginRuntime } from 'every-plugin';
import { EverythingDevCli } from '@everything-dev/cli';

const runtime = createPluginRuntime({
  registry: {
    cli: { module: EverythingDevCli }
  },
  secrets: {
    NEAR_PRIVATE_KEY: process.env.NEAR_PRIVATE_KEY || "",
  }
});

// Use CLI commands from other tools
const cli = await runtime.usePlugin('cli');
await cli.createClient().spawnProcess({ appKey: 'ui', command: 'dev' });
await cli.createClient().listProcesses();
```

### CLI Contract

```typescript
import { os } from 'everything-plugin/orpc';
import { z } from 'everything-plugin/zod';
import { CommonPluginErrors } from 'every-plugin';

const cliContract = os.router({
  spawnProcess: os
    .route({ method: 'POST', path: '/spawn-process' })
    .input(z.object({
      appKey: z.string(),
      command: z.enum(['build', 'start', 'dev']),
    }))
    .output(z.object({
      status: z.enum(['started', 'error']),
      pid: z.number().optional(),
      appKey: z.string(),
    }))
    .errors(CommonPluginErrors),

  killProcess: os
    .route({ method: 'POST', path: '/kill-process' })
    .input(z.object({ pid: z.number() }))
    .output(z.object({ status: z.enum(['killed', 'error']) }))
    .errors(CommonPluginErrors),

  listProcesses: os
    .route({ method: 'GET', path: '/list-processes' })
    .output(z.object({
      processes: z.array(z.object({
        appKey: z.string(),
        pid: z.number(),
        command: z.string(),
        status: z.enum(['running', 'stopped', 'error']),
      })),
    }))
    .errors(CommonPluginErrors),

  getAppStatus: os
    .route({ method: 'GET', path: '/status/{appKey}' })
    .input(z.object({}))
    .output(z.object({
      mode: z.enum(['local', 'remote']),
      status: z.enum(['running', 'stopped', 'error']),
      url: z.string().optional(),
    }))
    .errors(CommonPluginErrors),
});
```

## Help

Show command help:

```bash
everything-dev run --help
everything-dev dev --help
everything-dev add plugin --help
everything-dev add ui --help
everything-dev deploy --help
```

## Global Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Show CLI version |
| `-h, --help` | Show command help |
| `--log-level` | Set log level (debug, info, warn, error) |
| `--no-colors` | Disable colored output |
| `--silent` | Suppress non-error output |

## Best Practices

1. **Start with `everything-dev dev local`** - Test before deploying
2. **Use templates** - Scaffold with `add plugin/ui --template`
3. **Deploy frequently** - Small changes deploy faster
4. **Monitor with status** - Use `status --watch` for health checks
5. **Keep shared deps in sync** - Update all modules together
6. **Use dry-run mode** - Test commands before executing

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error occurred |
| `2` | Invalid arguments |
| `3` | Config file not found |
| `4` | Build failed |
| `5` | Deployment failed |

## Next Steps

Read these for complete workflows:

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Core concepts and patterns
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Zephyr hooks and deployment
- **[PLUGINS.md](./PLUGINS.md)** - Plugin patterns and contracts
- **[UI.md](./UI.md)** - SSR patterns and hydration
- **[EXAMPLES.md](./EXAMPLES.md)** - End-to-end workflows