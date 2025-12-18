# api

[every-plugin](https://github.com/near-everything/every-plugin) based API.

## Plugin Architecture

Built with **every-plugin** framework (Rspack + Module Federation):

```
┌─────────────────────────────────────────────────────────┐
│                    createPlugin()                       │
├─────────────────────────────────────────────────────────┤
│  variables: {  ... }                │
│  secrets: { ... }  │
│  contract: oRPC route definitions                       │
│  initialize(): Effect → services                        │
│  createRouter(): handlers using services                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Host Integration                      │
├─────────────────────────────────────────────────────────┤
│  registry.json → plugin URL + secrets                   │
│  runtime.ts → createPluginRuntime().usePlugin()         │
│  routers/index.ts → merge plugin.router into AppRouter  │
└─────────────────────────────────────────────────────────┘
```

**Plugin Structure:**

- `contract.ts` - oRPC contract definition (routes, schemas)
- `index.ts` - Plugin initialization + router handlers
- `schema.ts` - Zod schemas for input/output validation
- `services/` - Business logic (products, orders, stripe, fulfillment)
- `db/` - Database schema and migrations

**Extending with more plugins:**

Each domain can be its own plugin with independent:

- Contract definition
- Initialization logic  
- Router handlers
- Database schema

## Tech Stack

- **Framework**: every-plugin + oRPC
- **Effects**: Effect-TS for service composition
- **Database**: SQLite (libsql) + Drizzle ORM

## Available Scripts

- `bun dev` - Start dev server
- `bun build` - Build plugin
- `bun test` - Run tests
- `bun db:push` - Push schema to database
- `bun db:studio` - Open Drizzle Studio

## Configuration

**Host registry** (`host/registry.json`):

```json
{
  "api": {
      "development": "http://localhost:3014/remoteEntry.js",
      "production": "https://cdn.example.com/api/remoteEntry.js",
      "variables": {
      },
      "secrets": [
        "DATABASE_URL",
        "DATABASE_AUTH_TOKEN"
      ]
    }
}
```
