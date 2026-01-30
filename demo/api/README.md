# api

[every-plugin](https://github.com/near-everything/every-plugin) based API with oRPC and Effect-TS.

## Plugin Architecture

Built with **every-plugin** framework (Rspack + Module Federation):

```
┌─────────────────────────────────────────────────────────┐
│                    createPlugin()                       │
├─────────────────────────────────────────────────────────┤
│  variables: { ... }                                     │
│  secrets: { ... }                                       │
│  contract: oRPC route definitions                       │
│  initialize(): Effect → services                        │
│  createRouter(): handlers using services                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Host Integration                      │
├─────────────────────────────────────────────────────────┤
│  bos.config.json → plugin URL + secrets                 │
│  runtime.ts → createPluginRuntime().usePlugin()         │
│  routers/index.ts → merge plugin.router into AppRouter  │
└─────────────────────────────────────────────────────────┘
```

**Plugin Structure:**

- `contract.ts` - oRPC contract definition (routes, schemas)
- `index.ts` - Plugin initialization + router handlers
- `services/` - Business logic with Effect-TS
- `db/` - Database schema and migrations

## Development

```bash
bos dev --host remote   # Remote host, local UI + API (typical)
bos dev --ui remote     # Isolate API work
```

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://example-api.zephyrcloud.app",
      "proxy": "https://example-api.zephyrcloud.app",
      "variables": {},
      "secrets": [
        "API_DATABASE_URL",
        "API_DATABASE_AUTH_TOKEN"
      ],
      "template": "near-everything/every-plugin/demo/api",
      "files": [
        "rspack.config.cjs",
        "tsconfig.json",
        "vitest.config.ts",
        "drizzle.config.ts",
        "plugin.dev.ts"
      ],
      "sync": {
        "scripts": ["dev", "build", "test"]
      }
    }
  }
}
```

## Tech Stack

- **Framework**: every-plugin + oRPC
- **Effects**: Effect-TS for service composition
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rspack + Module Federation

## Scripts

- `bun dev` - Start dev server (port 3014)
- `bun build` - Build plugin
- `bun test` - Run tests
- `bun db:push` - Push schema to database
- `bun db:studio` - Open Drizzle Studio
