# host

Server host for the application with authentication and Module Federation.

## Architecture

The host orchestrates two federation systems:

```
┌─────────────────────────────────────────────────────────┐
│                        host                             │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │                  server.ts                     │     │
│  │  Hono.js + oRPC handlers                       │     │
│  └────────────────────────────────────────────────┘     │
│           ↑                         ↑                   │
│  ┌────────┴────────┐       ┌────────┴────────┐          │
│  │ remotes.json    │       │ registry.json   │          │
│  │ UI Federation   │       │ API Plugins     │          │
│  └────────┬────────┘       └────────┬────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ Module Fed      │       │ every-plugin    │          │
│  │ runtime         │       │ runtime         │          │
│  └─────────────────┘       └─────────────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ React app       │       │ oRPC router     │          │
│  │ (SSR/CSR)       │       │ (merged)        │          │
│  └─────────────────┘       └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Federation

**UI Remotes** (`remotes.json`):

```json
{
  "ui": {
    "url": "https://...",
    "exposes": {
      "App": "./App",
      "Router": "./Router",
      "components": "./components",
      "providers": "./providers"
    }
  }
}
```

**API Plugins** (`registry.json`):

```json
{
  "plugins": {
    "api": {
      "remote": "https://...",
      "secrets": {
        "STRIPE_SECRET_KEY": "{{STRIPE_SECRET_KEY}}"
      }
    }
  }
}
```

**Router Composition** (`routers/index.ts`):

```typescript
return {
  ...baseRouter,           // /health, /status
  ...plugins.api.router,   // plugin routes
}
```

## Tech Stack

- **Server**: Hono.js + @hono/node-server
- **API**: oRPC (RPC + OpenAPI)
- **Auth**: Better-Auth + better-near-auth
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rsbuild + Module Federation
- **Plugins**: every-plugin runtime

## Available Scripts

- `bun dev` - Start dev server (API: 3000, UI: 3001)
- `bun build` - Build for production
- `bun preview` - Run production server
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## API Routes

- `/api/auth/*` - Authentication endpoints (Better-Auth)
- `/api/rpc/*` - RPC endpoint (batching supported)
- `/api/*` - REST API (OpenAPI spec)
- `/api/webhooks/stripe` - Stripe webhook handler
- `/api/webhooks/fulfillment` - Fulfillment webhook handler
- `/health` - Health check

## Adding New Plugins

1. Add plugin to `registry.json`:
```json
{
  "plugins": {
    "new-plugin": {
      "remote": "https://plugin-url...",
      "variables": {},
      "secrets": {}
    }
  }
}
```

2. Plugin router is automatically merged in `routers/index.ts`
