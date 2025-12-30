# host

Server host with authentication and Module Federation.

## Architecture

The host orchestrates both UI and API federation:

```bash
┌─────────────────────────────────────────────────────────┐
│                        host                             │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │                  server.ts                     │     │
│  │  Hono.js + oRPC handlers                       │     │
│  └────────────────────────────────────────────────┘     │
│           ↑                         ↑                   │
│           │      bos.config.json    │                   │
│           │    (single source)      │                   │
│  ┌────────┴────────┐       ┌────────┴────────┐          │
│  │ UI Federation   │       │ API Plugins     │          │
│  │ (remoteEntry)   │       │ (every-plugin)  │          │
│  └────────┬────────┘       └────────┬────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ React app       │       │ oRPC router     │          │
│  │ (SSR/CSR)       │       │ (merged)        │          │
│  └─────────────────┘       └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Configuration

All configuration from `bos.config.json`:

```json
{
  "account": "example.near",
  "app": {
    "host": {
      "title": "App Title",
      "development": "http://localhost:3001",
      "production": "https://example.com"
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://cdn.example.com/ui"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://cdn.example.com/api",
      "secrets": ["API_DATABASE_URL", "API_DATABASE_AUTH_TOKEN"]
    }
  }
}
```

**Environment Variables:**

- `UI_SOURCE` - `local` or `remote` (defaults based on NODE_ENV)
- `API_SOURCE` - `local` or `remote` (defaults based on NODE_ENV)
- `API_PROXY` - Proxy API requests to another host

## Tech Stack

- **Server**: Hono.js + @hono/node-server
- **API**: oRPC (RPC + OpenAPI)
- **Auth**: Better-Auth + better-near-auth (SIWN)
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rsbuild + Module Federation
- **Plugins**: every-plugin runtime

## Available Scripts

- `bun dev` - Start dev server (port 3001)
- `bun build` - Build for production
- `bun preview` - Run production server
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## API Routes

- `/health` - Health check
- `/api/auth/*` - Authentication endpoints (Better-Auth)
- `/api/rpc/*` - RPC endpoint (batching supported)
- `/api/*` - REST API (OpenAPI spec)
