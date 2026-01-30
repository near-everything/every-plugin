# host

Server host with authentication, Module Federation orchestration, and every-plugin runtime.

## Architecture

The host orchestrates both UI and API federation:

```
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

## Development

```bash
bos dev --host remote   # Remote host, local UI + API (typical)
bos dev                 # Full local development
```

## Production

```bash
bos start --no-interactive   # All remotes, production URLs
```

## Configuration

**bos.config.json**:

```json
{
  "app": {
    "host": {
      "title": "App Title",
      "description": "Description of the application",
      "development": "http://localhost:3000",
      "production": "https://example.zephyrcloud.app",
      "secrets": [
        "HOST_DATABASE_URL",
        "HOST_DATABASE_AUTH_TOKEN",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL"
      ],
      "template": "near-everything/every-plugin/demo/host",
      "files": [
        "rsbuild.config.ts",
        "tsconfig.json",
        "vitest.config.ts",
        "drizzle.config.ts"
      ],
      "sync": {
        "scripts": ["dev", "build", "test"]
      }
    }
  }
}
```

**Environment Variables:**

| Variable | Description | Default |
|----------|-------------|---------|
| `UI_SOURCE` | `local` or `remote` | Based on NODE_ENV |
| `API_SOURCE` | `local` or `remote` | Based on NODE_ENV |
| `API_PROXY` | Proxy API requests to another host URL | - |
| `HOST_DATABASE_URL` | SQLite database URL for auth | `file:./database.db` |
| `HOST_DATABASE_AUTH_TOKEN` | Auth token for remote database | - |
| `BETTER_AUTH_SECRET` | Secret for session encryption | - |
| `BETTER_AUTH_URL` | Base URL for auth endpoints | - |
| `CORS_ORIGIN` | Comma-separated allowed origins | Host + UI URLs |

### Proxy Mode

Set `API_PROXY=true` or `API_PROXY=<url>` to proxy all `/api/*` requests to another host:

```bash
API_PROXY=https://production.example.com bos dev
```

## Tech Stack

- **Server**: Hono.js + @hono/node-server
- **API**: oRPC (RPC + OpenAPI)
- **Auth**: Better-Auth + better-near-auth (SIWN)
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rsbuild + Module Federation
- **Plugins**: every-plugin runtime

## Scripts

- `bun dev` - Start dev server (port 3000)
- `bun build` - Build MF bundle for production
- `bun bootstrap` - Run host from remote MF URL
- `bun preview` - Run production server locally
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## Remote Host Mode

The host can be deployed as a Module Federation remote:

```bash
# Build and deploy
bos build host
bos deploy host

# Others can run from the remote URL
HOST_REMOTE_URL=https://your-zephyr-url.zephyrcloud.app bun bootstrap
```

## API Routes

| Route | Description |
|-------|-------------|
| `/health` | Health check |
| `/api/auth/*` | Authentication endpoints (Better-Auth) |
| `/api/rpc/*` | RPC endpoint (batching supported) |
| `/api/*` | REST API (OpenAPI spec at `/api`) |
