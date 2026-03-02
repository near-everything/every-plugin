# host

Server host with authentication, oRPC API, and Module Federation orchestration.

## Architecture

The host runs the API + auth and loads the UI app as a Module Federation remote:

```
┌─────────────────────────────────────────────────────────┐
│                        host                             │
│                                                         │
│  ┌────────────────────────────────────────────────┐     │
│  │                src/program.ts                  │     │
│  │  Hono.js + oRPC + SSR renderer                 │     │
│  └────────────────────────────────────────────────┘     │
│           ↑                         ↑                   │
│           │      bos.config.json    │                   │
│           │    (single source)      │                   │
│  ┌────────┴────────┐       ┌────────┴────────┐          │
│  │ UI Remote       │       │ API Plugins     │          │
│  │ (MF remote)     │       │ (every-plugin)  │          │
│  └────────┬────────┘       └────────┬────────┘          │
│           ↓                         ↓                   │
│  ┌─────────────────┐       ┌─────────────────┐          │
│  │ UI app          │       │ oRPC router     │          │
│  │ (remote-owned   │       │ (merged)        │          │
│  │ __root + routes) │      │                 │          │
│  └─────────────────┘       └─────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Development

```bash
bos dev --host remote   # Remote host, local UI + API (typical)
bos dev                 # Full local development
```

## Module Federation mount points

The host provides stable, same-origin URLs for UI federation assets and proxies
to the URLs in `bos.config.json` at runtime:

- `/__mf/ui/*` -> UI browser build (`app.ui.*`)
- `/__mf/ui/ssr/*` -> UI SSR build (`app.ui.ssr`)

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

- `bun dev` - Run built server bundle (started by BOS)
- `bun build` - Build host client + server bundles
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
