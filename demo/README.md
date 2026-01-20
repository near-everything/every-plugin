# Module Federation Monorepo

A production-ready Module Federation monorepo demonstrating every-plugin architecture, runtime-loaded configuration, and NEAR Protocol integration.

Built with React, Hono.js, oRPC, Better-Auth, and Module Federation.

## Quick Start

```bash
bun install        # Install dependencies
bun demo db migrate   # Run database migrations
bun demo dev       # Start all services (API, UI, Host)
```

Visit http://localhost:3000 to see the application.

## Documentation

- **[LLM.txt](./LLM.txt)** - Technical guide for LLMs and developers (architecture, patterns, examples)
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines and development workflow
- **[API README](./api/README.md)** - API plugin documentation
- **[UI README](./ui/README.md)** - Frontend documentation
- **[Host README](./host/README.md)** - Server host documentation

## Architecture

**Module Federation Monorepo** with runtime-loaded configuration:

```
┌─────────────────────────────────────────────────────────┐
│                  host (Server)                          │
│  Hono.js + oRPC + bos.config.json loader                │
│  ┌──────────────────┐      ┌──────────────────┐         │
│  │ Module Federation│      │ every-plugin     │         │
│  │ Runtime          │      │ Runtime          │         │
│  └────────┬─────────┘      └────────┬─────────┘         │
│           ↓                         ↓                   │
│  Loads UI Remote           Loads API Plugins            │
└───────────┬─────────────────────────┬───────────────────┘
            ↓                         ↓
┌───────────────────────┐ ┌───────────────────────┐
│    ui/ (Remote)       │ │   api/ (Plugin)       │
│  React + TanStack     │ │  oRPC + Effect        │
│  remoteEntry.js       │ │  remoteEntry.js       │
└───────────────────────┘ └───────────────────────┘
```

**Key Features:**
- ✅ **Runtime Configuration** - All URLs loaded from `bos.config.json` (no rebuild needed!)
- ✅ **Independent Deployment** - UI, API, and Host deploy separately
- ✅ **Type Safety** - End-to-end with oRPC contracts
- ✅ **CDN-Ready** - Module Federation with automatic CDN deployment

See [LLM.txt](./LLM.txt) for complete architecture details.

## Tech Stack

**Frontend:**
- React 19 + TanStack Router (file-based) + TanStack Query
- Tailwind CSS v4 + shadcn/ui components
- Module Federation for microfrontend architecture

**Backend:**
- Hono.js server + oRPC (type-safe RPC + OpenAPI)
- every-plugin architecture for modular APIs
- Effect-TS for service composition

**Database & Auth:**
- SQLite (libsql) + Drizzle ORM
- Better-Auth with NEAR Protocol support

## CLI Commands

The demo monorepo includes a CLI for common workflows. Run commands with `bun demo <command>`.

### Development

```bash
bun demo dev           # Full local development (API + UI + Host)
bun demo dev --ui      # UI development (remote API, local UI)
bun demo dev --api     # API development (remote UI, local API)
bun demo dev --host    # Host only (all remote)
bun demo dev --proxy   # Proxy mode (proxy API requests to remote)
```

### Build

```bash
bun demo build         # Build all packages
bun demo build ui      # Build UI only
bun demo build api     # Build API only
bun demo build host    # Build host only
bun demo build --force # Force rebuild (ignore turbo cache)
```

### Testing

```bash
bun demo test              # Run all tests (host + api)
bun demo test -f host      # Run host tests only
bun demo test -f api       # Run API tests only
bun demo test:ssr          # Run SSR integration tests (uses existing UI bundle)
bun demo test:ssr --watch  # Watch mode - rebuild UI on changes
```

### Database

```bash
bun demo db migrate        # Run migrations
bun demo db push           # Push schema changes
bun demo db generate       # Generate migrations
bun demo db studio         # Open Drizzle Studio
bun demo db sync           # Sync database schema
bun demo db migrate -f api # Run API database migrations
```

### Utilities

```bash
bun demo clean             # Clean build artifacts and caches
```

## Configuration

All runtime configuration lives in `bos.config.json`:

```json
{
  "account": "example.near",
  "app": {
    "host": {
      "title": "App Title",
      "development": "http://localhost:3000",
      "production": "https://example.com"
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://cdn.example.com/ui/remoteEntry.js"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://cdn.example.com/api/remoteEntry.js",
      "variables": {},
      "secrets": ["API_DATABASE_URL", "API_DATABASE_AUTH_TOKEN"]
    }
  }
}
```

**Benefits:**
- Switch environments via `NODE_ENV` (no rebuild)
- Update CDN URLs without code changes
- Template injection for secrets

## Development Workflow

1. **Make changes** to any workspace (ui/, api/, host/)
2. **Hot reload** works automatically during development
3. **Build & deploy** independently:
   - `bun demo build ui` → uploads to CDN → updates `bos.config.json`
   - `bun demo build api` → uploads to CDN → updates `bos.config.json`
   - Host automatically loads new versions!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development workflow.

## SSR (Server-Side Rendering)

The host uses **TanStack Router SSR streaming** to render UI on the server:

- Routes can configure SSR behavior: `ssr: true`, `ssr: 'data-only'`, or `ssr: false`
- Authenticated routes use `ssr: false` to skip server rendering (avoids auth on server)
- The UI bundle is loaded via Module Federation at runtime

**Testing SSR:**
```bash
bun demo build ui      # Build UI bundle first
bun demo test:ssr      # Run SSR integration tests
```

## Related Projects

- **[every-plugin](https://github.com/near-everything/every-plugin)** - Plugin framework for modular APIs
- **[near-kit](https://kit.near.tools)** - Unified NEAR Protocol SDK
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** - NEAR authentication for Better-Auth

## License

MIT
