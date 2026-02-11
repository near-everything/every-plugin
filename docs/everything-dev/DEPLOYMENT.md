# Deployment

Deployment is handled automatically by the Zephyr rsbuild plugin. The framework manages builds, uploads, and config updates for you.

## Overview

Deploying to Zephyr CDN is automatic:

```bash
# Single command builds and uploads everything
everything-dev deploy --all

# Or build and deploy in steps
everything-dev build
everything-dev deploy
```

## Zephyr Plugin Integration

The Zephyr plugin hooks into the build pipeline and automatically updates `.every.dev`:

```typescript
// rsbuild.config.ts
import { withZephyr } from 'zephyr-rsbuild-plugin';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

const shouldDeploy = process.env.DEPLOY === 'true';

export default defineConfig({
  plugins: [
    pluginReact(),

    // Module Federation for remote modules
    pluginModuleFederation({
      name: 'my-ui',
      filename: 'remoteEntry.js',
      exposes: {
        './Router': './src/router.server.tsx',
        './Hydrate': './src/hydrate.tsx',
        './remote': './src/remote/index.ts',
        './components': './src/components/index.ts',
      },
      shared: {
        react: { singleton: true, eager: true },
        'react-dom': { singleton: true, eager: true },
      },
    }),

    ...(shouldDeploy
      ? [withZephyr({
          hooks: {
            onDeployComplete: (info: { url: string; buildNumber: number }) => {
              console.log(`Deployed: ${info.url} (#${info.buildNumber})`);
              // Auto-update .every.dev by checking URL patterns and updating matching config

              // Auto-detect deploy type and update appropriate config:
              if (info.url.includes('/ui/remoteEntry.js')) {
                console.log('  → UI client deploy');
                updateConfig('ui.remote', info.url);
              } else if (info.url.includes('/ui-ssr/remoteEntry.server.js')) {
                console.log('  → UI SSR deploy');
                updateConfig('ui.ssr', info.url);
              } else if (info.url.includes('/host/remoteEntry.js')) {
                console.log('  → Host deploy');
                updateConfig('host.remote', info.url);
              }

              return;
            },
          },
        })
      }]
      : []
    ),
  ],
});
```

Note: The `updateConfig` function is a helper that updates `.every.dev` after successful deployment.

## Build Types

### UI Client Build

```bash
# Build client-side UI bundle
BUILD_TARGET=client rsbuild build

# Output: dist/remoteEntry.js
# Uploads to: https://cdn.zephyr.com/v{build}/ui/remoteEntry.js
# Updates: .every-dev.apps.ui.remote
```

### SSR Build

```bash
# Build SSR bundle (Node.js)
BUILD_TARGET=server rsbuild build

# Target: async-node
# Output: dist/remoteEntry.server.js
# Uploads to: https://cdn.zephyr.com/v{build}/ui-ssr/remoteEntry.server.js
# Updates: .every-dev.apps.ui.ssr
```

### API Plugin Build

```bash
# Build API plugin
rsbuild build

# Target: web
# Output: dist/remoteEntry.js
# Uploads to: https://cdn.zephyr.com/v{build}/api/remoteEntry.js
# Updates: .every.dev.apps.api.remote
```

### Host Build

```bash
# Build host application
rsbuild build

# Target: web
# Output: dist/remoteEntry.js
# Uploads to: https://cdn.zephyr.com/v{build}/host/remoteEntry.js
# Updates: .every-dev.apps.host.remote
```

## Deployment Workflow

### Automatic Deployment

```bash
# One command: build + upload + update config
cd ui
everything-dev deploy --all

# The CLI handles:
# 1. Build: rsbuild build (auto-detect client vs server)
# 2. Upload: zephyr cloud upload --auth
# 3. Get URL: https://cdn.zephyr.com/vXXXX/app/remoteEntry.js
# 4. Update config: .every-dev.apps[app].remote = newUrl
# 5. Print summary with CDN URLs
```

### Manual Deployment

If you need more control:

```bash
# 1. Build
rsbuild build

# 2. Upload manually (using Zephyr CLI)
zephyr upload dist/

# 3. Get URL
zephyr url dist/remoteEntry.js

# 4. Update .everything.dev manually
vim .everything.dev  # Update apps[app].remote with new URL
```

## Config Updates After Deployment

The Zephyr plugin automatically updates `.every.dev` based on build target:

```bash
# Before deployment
{
  "apps": {
    "ui": {
      "production": "https://cdn.zephyr.com/v2083/ui/remoteEntry.js",
      "ssr": "https://cdn.zephyr.com/v2084/ui-ssr/remoteEntry.server.js"
    }
  }
}

# After BUILD_TARGET=client deploy
{
  "apps": {
    "ui": {
      "production": "https://cdn.zephyr.com/v2105/ui/remoteEntry.js",  // Updated
      "ssr": "https://cdn.zephyr.com/v2084/ui-ssr/remoteEntry.server.js"  // Unchanged
    }
  }
}
```

## Module Federation Configuration

### Remote Exposes (UI)

```typescript
// rsbuild.config.ts - Client build
pluginModuleFederation({
  name: 'my-ui',
  filename: 'remoteEntry.js',
  exposes: {
    './Router': './src/router.server.tsx',
    './Hydrate': './src/hydrate.tsx',
    './remote': './src/remote/index.ts',
    './components': './src/components/index.ts',
    './hooks': './src/hooks/index.ts',
  },
  shared: {
    react: { singleton: true, eager: true, requiredVersion: '^19.0.0' },
    'react-dom': { singleton: true, eager: true, requiredVersion: '^19.0.0' },
    '@tanstack/react-router': { singleton: true, eager: true, requiredVersion: '^1.0.0' },
    // ... more shared deps
  },
});
```

### Remote Entry Points

```typescript
// Files created at build time:

// Client (remoteEntry.js)
import('./src/router.server.tsx');  // Not correct for client
import('./src/hydrate.tsx');      // Wrong for client
import('./src/remote/index.ts');    // Correct export

// Actual structure after fix:
// remoteEntry.js exposes:
// → ./Router (client router)
// → ./Hydrate (client hydrator)
// → ./remote (API client types)
// → ./components (shared components)
// → ./hooks (shared hooks)
```

### Remote Entry Points (FIXED)

```typescript
// rsbuild.config.ts - Exposes configuration mapping
module.exports = {
  exposes: {
    './Router': './src/router.tsx',            // Client router (not SSR!)
    './Hydrate': './src/hydrate.tsx',          // Hydrator
    './remote': './src/remote/index.ts',           // Type exports for API client
    './components': './src/components/index.ts',     // Components to mount in host
    './hooks': './src/hooks/index.ts',              // Hooks to use in host
  },
};
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DEPLOY` | Enable Zephyr upload | `DEPLOY=true` |
| `BUILD_TARGET` | Build type (client/server) | `BUILD_TARGET=server` |
| `ZEPHYR_API_KEY` | Zephyr authentication | `ze-server-token:xxx-xxx` |
| `ZE_USER_EMAIL` | Zephyr account email | `user@company.com` |
| `ZEPHYR_API_URL` | Custom Zephyr API URL | ZEPHYR_API_URL=https://api.zephyr.com` |

## Environment Files

### Priority Order (Highest to Lowest)

1. `.env.production` - Production-specific overrides
2. `.env.local` - Local development overrides
3. `.env.development` - Development defaults
4. `.env` - Generic defaults
5. `process.env` - Runtime environment

### Example: Development Setup

```bash
# .env.development (local dev)
NODE_ENV=development
ZEPHYR_API_URL=http://localhost:8787
ZEPHYR_SERVER_TOKEN=test-token

# .env.production (deployed build)
NODE_ENV=production
ZEPHYR_API_URL=https://api.near-sdk.zephyr.com
ZEPHYR_SERVER_TOKEN={{ZE_SERVER_TOKEN}}
DEPLOY=true
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Install dependencies
        run: bun install

      - name: Build and deploy UI client
        run: |
          cd ui
          DEPLOY=true bun run build:client
        env:
          ZE_SERVER_TOKEN: ${{ secrets.ZE_SERVER_TOKEN }}
          ZE_USER_EMAIL: ${{ secrets.ZE_USER_EMAIL }}

      - name: Build and deploy UI SSR
        run: |
          cd ui
          BUILD_TARGET=server DEPLOY=true bu run build:ssr
        env:
          ZE_SERVER_TOKEN: ${{ secrets.ZE_SERVER_TOKEN }}
          ZE_USER_EMAIL: ${{ secrets.ZE_USER_EMAIL }}

      - name: Deploy host
        run: |
          cd host
          DEPLOY=true npm run deploy
        env:
          ZE_SERVER_TOKEN: ${{ secrets.ZE_SERVER_TOKEN }}
          ZE_USER_EMAIL: ${{ secrets.ZE_USER_EMAIL }}

  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - name: Build and deploy API
        run: |
          cd packages/cli
          npm install
          npx vitest run bos-start-hydration.test.ts
          bun pkg-cli deploy api --deploy
        env:
          ZE_SERVER_TOKEN: ${{ secrets.ZE_SERVER_TOKEN }}"
```

### GitLab CI

```bash
# .gitlab-ci.yml
stages:
  build:
  stage: build
  script:
    - cd ui && BUILD_TARGET=client DEPLOY=true bun run build
    - BUILD_TARGET=server DEPLOY=true bun run build:ssr
    - cd host && DEPLOY=true npm run deploy

deploy:
  stage: deploy
  script:
    - npx everything-dev deploy --all
  variables:
    ZE_SERVER_TOKEN: $ZE_SERVER_TOKEN
```

## Manual Deployment

### Step-by-Step

```bash
# 1. Clean old builds
rm -rf ui/dist host/dist api/dist

# 2. Build UI client
cd ui
BUILD_TARGET=client DEPLOY=true bun run build
# Output: Deployed to https://cdn.zephyr.com/vXXXX/ui/remoteEntry.js

# Build UI SSR
BUILD_TARGET=server DEPLOY=true bun run build
# Output: Deployed to https://cdn.zephyr.com/vXXXX/ui-ssr/remoteEntry.server.js

# 3. Build Host
cd ../host
DEPLOY=true npm run build
# Output: Deployed to https://cdn.zephyr.com/vXXXX/host/remoteEntry.js

# 4. Build API
cd ../packages/ecosy/api-minimal
DEPLOY=true bun run deploy
# Output: Deployed to https://cdn.zephyr.com/vXXXX/api-minimal/remoteEntry.js
```

## Local Testing

### Test Deployment Locally

```bash
# 1. Start dev server (no deployment needed)
everything-dev dev local

# 2. Test endpoints
curl http://localhost:3000/api/ping
curl http://localhost:3000/

# 3. Test remote loading (will load latest deployed version)
curl http://localhost:3000/  # Should load from Zephyr CDN
```

### Testing Without Deploying

If you just want to verify without uploading:

```bash
# 1. Build without deployment
cd ui

BUILD_TARGET=client rsbuild build
BUILD_TARGET=server rsbuild build

# 2. Start dev server with compiled code
cd ../host
everything-dev dev local

# 3. Test locally
curl http://localhost:3000/  # Should serve SSR with injected config
curl http://localhost:3000/api/ping  # Should return {"status": "ok"}
```

## Testing Deployment URLs

After deployment, verify the URLs work:

```bash
# Check each deployed URL
curl -I https://cdn.zephyr.com/v2090/ui/remoteEntry.js
# Output should be 200 OK with proper Content-Type
# Contains: Content-Type: text/javascript

curl https://cdn.zephyr.com/v2091/ui-ssr/remoteEntry.server.js
# Output should be 200 OK
# Should contain compiled Node.js code (verify by checking content)

curl https://cdn.zephyr.com/v2092/api/remoteEntry.js
# Output should be 200 OK
# Should contain compiled browser code (verify by checking content)
```

## Rollbacks

If a deployment breaks production:

```bash
# 1. Check build history
everything-dev build --history

# 2. Revert to previous build
everything-dev build --rollback

# 3. Or restore from version tags
BUILD_TARGET=client BUILD_TARGET=server git checkout v2093

# 4. Re-deploy previous version
DEPLOY=true bun run build
```

## Troubleshooting

### Build Fails

```bash
# Check build log
rsbuild build --stats > build.log
cat build.log

# Check TypeScript errors
bunx tsc --noEmit

# Fix errors in source code, then rebuild
npx vitest --run
```

### Upload Fails

```bash
# Test API key and network
curl -v https://api.zephyrcloud.io/health  # Check Zephyr status

# Check authentication
echo $ZEPHYR_SERVER_TOKEN | wc -c  # Should be > 0

# Verify network connectivity
curl -I https://cdn.zephyr.com
```

### Deployed Code Not Updating

```bash
# Force cache invalidation
everything-dev deploy --force

# Clear browser/CDN cache manually:
curl -X POST https://api.zephyrcloud.io/api/clear-cache \
  -H "Authorization: Bearer $ZEPHYR_SERVER_TOKEN"

# Or wait for cache TTL (default: 1 minute)
```

### Zephyr Plugin Errors

```bash
# Check ZephyR authentication
echo $ZEPHYR_SERVER_TOKEN | head -c 10

# Check account permissions
zephyr account info

# Check build size limits
du -sh dist/  # Should be < 10MB for CDN uploads

# Check upload speeds
rsbuild build --stats | grep "Total:"  # Check bundle sizes
```

## Best Practices

1. **Always use Zephyr hooks** - Let the plugin manage updates
2. **Test before deploying** - Use `everything-dev dev local` first
3. **Deploy frequently** - Small changes deploy faster
```
6. **Monitor build size** - Large bundles slow down loading
7. **Keep shared deps in sync** - Update all modules together
```

## Summary

- Build types: client, server (SSR), api, host
- Auto-upload on `DEPLOY=true`
- Auto-updates `.every.dev` via onDeployComplete hook
- Config discovery: `.env.production` → `.env.local` → `.env.development` → `.env`
- CI/CD: GitHub Actions, GitLab CI supported
- Rollbacks: `--rollback`, `git checkout`, force cache invalidate
- Type-safe: `rsbuild.d.ts` validates TypeScript
- Zephyr account authentication required for uploads

See [CLI.md](./CLI.md) for deployment commands and [ARCHITECTURE.md](./ARCHITECTURE.md) for core concepts.