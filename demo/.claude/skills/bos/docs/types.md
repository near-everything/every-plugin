# BosConfig Schema

The `bos.config.json` file is the single source of truth for all runtime configuration.

## Schema (from `demo/cli/src/types.ts`)

```typescript
interface BosConfig {
  account: string;                    // NEAR mainnet account
  testnet?: string;                   // NEAR testnet account
  template?: string;                  // Default template for scaffolding
  
  gateway: {
    development: string;              // e.g., "http://localhost:8787"
    production: string;               // e.g., "https://everything.dev"
  };
  
  cli?: {
    version?: string;                 // CLI version for sync
  };
  
  shared?: {                          // Shared dependencies by category
    ui?: Record<string, SharedDepConfig>;
    api?: Record<string, SharedDepConfig>;
  };
  
  app: {
    host: HostConfig;
    ui?: RemoteConfig;
    api?: RemoteConfig;
    [key: string]: HostConfig | RemoteConfig;
  };
}

interface HostConfig {
  title: string;
  description?: string;
  development: string;                // e.g., "http://localhost:3000"
  production: string;                 // e.g., "https://your-app.zephyrcloud.app"
  secrets?: string[];                 // Environment variable names
  template?: string;                  // Template for scaffolding
  files?: string[];                   // Files to sync from template
  sync?: SyncConfig;
}

interface RemoteConfig {
  name: string;                       // Module name
  development: string;
  production: string;
  ssr?: string;                       // SSR bundle URL
  proxy?: string;                     // Proxy target for API
  exposes?: Record<string, string>;   // Module Federation exposes
  variables?: Record<string, string>;
  secrets?: string[];
  template?: string;
  files?: string[];
  sync?: SyncConfig;
}

interface SharedDepConfig {
  requiredVersion?: string;           // e.g., "19.2.4"
  singleton?: boolean;
  eager?: boolean;
  strictVersion?: boolean;
}

interface SyncConfig {
  scripts?: string[] | true;          // Scripts to sync
  dependencies?: boolean;             // Sync dependencies
  devDependencies?: boolean;          // Sync devDependencies
}
```

## Example Configuration

```json
{
  "account": "every.near",
  "testnet": "every.testnet",
  "template": "near-everything/every-plugin/demo",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "shared": {
    "ui": {
      "react": { "requiredVersion": "19.2.4", "singleton": true, "eager": true },
      "react-dom": { "requiredVersion": "19.2.4", "singleton": true, "eager": true },
      "@tanstack/react-router": { "requiredVersion": "1.157.16", "singleton": true }
    }
  },
  "app": {
    "host": {
      "title": "My App",
      "description": "Description of my app",
      "development": "http://localhost:3000",
      "production": "https://my-app.zephyrcloud.app",
      "secrets": ["HOST_DATABASE_URL", "BETTER_AUTH_SECRET"],
      "template": "near-everything/every-plugin/demo/host",
      "files": ["rsbuild.config.ts", "tsconfig.json"],
      "sync": { "scripts": ["dev", "build", "test"] }
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://my-ui.zephyrcloud.app",
      "ssr": "https://my-ui-ssr.zephyrcloud.app",
      "exposes": {
        "./Router": "./src/router.tsx",
        "./components": "./src/components/index.ts"
      },
      "template": "near-everything/every-plugin/demo/ui"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://my-api.zephyrcloud.app",
      "variables": {},
      "secrets": ["API_DATABASE_URL"]
    }
  }
}
```

## Key Concepts

### Template Inheritance

Templates are GitHub paths used for scaffolding:
- Project template: `bos.config.json → template`
- Package templates: `bos.config.json → app.[package].template`

Default: `near-everything/every-plugin/demo`

### Shared Dependencies

The `shared` section defines Module Federation shared dependencies:
- `singleton: true` - Only one instance across all remotes
- `eager: true` - Load immediately (not lazy)
- `requiredVersion` - Version constraint

### Sync Configuration

The `sync` section controls what gets synced from upstream:
- `scripts` - Package.json scripts to copy
- `dependencies` / `devDependencies` - Whether to sync deps

### Secrets

Secrets are environment variable names that should be:
1. Stored in `.env.bos` locally
2. Uploaded to NOVA for encrypted storage
3. Injected at runtime via template strings
