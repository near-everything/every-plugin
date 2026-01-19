# host

Server host with authentication and Module Federation. Can be run locally or loaded from a remote Module Federation bundle.

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
      "production": "https://cdn.example.com/ui",
      "ssr": "https://cdn.example.com/ui-ssr"
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

Set `API_PROXY=true` or `API_PROXY=<url>` to proxy all `/api/*` requests to another host instead of loading the API plugin locally. Useful for:

- Development against production API
- Staging environments
- Testing without running the API server

```bash
API_PROXY=https://production.example.com bun dev
```

## Tech Stack

- **Server**: Hono.js + @hono/node-server
- **API**: oRPC (RPC + OpenAPI)
- **Auth**: Better-Auth + better-near-auth (SIWN)
- **Database**: SQLite (libsql) + Drizzle ORM
- **Build**: Rsbuild + Module Federation
- **Plugins**: every-plugin runtime

## Available Scripts

- `bun dev` - Start dev server (port 3001)
- `bun build` - Build MF bundle for production (outputs `remoteEntry.js`)
- `bun bootstrap` - Run host from remote MF URL (requires `HOST_REMOTE_URL`)
- `bun preview` - Run production server locally
- `bun db:migrate` - Run migrations
- `bun db:studio` - Open Drizzle Studio

## Remote Host Mode

The host can be deployed as a Module Federation remote and loaded dynamically at runtime:

### Building & Deploying

```bash
# Build the MF bundle (deploys to Zephyr, updates bos.config.json)
cd demo/host
bun build
```

This produces `dist/remoteEntry.js` and deploys to Zephyr. The Zephyr URL is saved to `bos.config.json → app.host.remote`.

### Using Remote Host in Development

```bash
# From the CLI - no local host code needed!
bos dev --remote-host
```

This loads and runs the host from the Zephyr URL configured in `bos.config.json`.

### Production Deployment (Railway/Docker)

Use the bootstrap script to run the host from a remote URL:

```bash
# Set the remote URL
export HOST_REMOTE_URL=https://your-zephyr-url.zephyrcloud.app

# Run
bun bootstrap
```

**Dockerfile example:**
```dockerfile
FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY bootstrap.ts ./
CMD ["bun", "bootstrap"]
```

**Required Environment Variables:**
- `HOST_REMOTE_URL` - Zephyr URL of the deployed host bundle
- `HOST_DATABASE_URL` - Database connection string
- `BETTER_AUTH_SECRET` - Auth encryption secret
- `BETTER_AUTH_URL` - Base URL for auth endpoints

### Benefits

1. **No local host code needed** - Just reference the remote URL
2. **Instant updates** - Deploy new bundle, containers pick it up on restart
3. **Version flexibility** - Pin to specific Zephyr URLs for stability
4. **Same binary everywhere** - Bootstrap script is tiny, all logic lives in the bundle

## API Routes

| Route | Description |
|-------|-------------|
| `/health` | Health check |
| `/api/auth/*` | Authentication endpoints (Better-Auth) |
| `/api/rpc/*` | RPC endpoint (batching supported) |
| `/api/*` | REST API (OpenAPI spec at `/api`) |
