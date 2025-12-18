# Module Federation Monorepo

A production-ready Module Federation monorepo demonstrating every-plugin architecture, runtime-loaded configuration, and NEAR Protocol integration.

Built with React, Hono.js, oRPC, Better-Auth, and Module Federation.

## Quick Start

```bash
bun install       # Install dependencies
bun db:migrate    # Run database migrations
bun dev           # Start all services (API, UI, Host)
```

Visit http://localhost:3001 to see the application.

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

## Configuration

All runtime configuration lives in `bos.config.json`:

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
      "production": "https://cdn.example.com/ui/remoteEntry.js"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://cdn.example.com/api/remoteEntry.js",
      "variables": {},
      "secrets": ["DATABASE_URL", "DATABASE_AUTH_TOKEN"]
    }
  }
}
```

**Benefits:**
- Switch environments via `NODE_ENV` (no rebuild)
- Update CDN URLs without code changes
- Template injection for secrets

## Available Scripts

```bash
# Development
bun dev              # All services (API: 3014, UI: 3002, Host: 3001)
bun dev:api          # API plugin only
bun dev:ui           # UI remote only
bun dev:host         # Host server only

# Production
bun build            # Build all packages
bun build:api        # Build API plugin → uploads to CDN
bun build:ui         # Build UI remote → uploads to CDN
bun build:host       # Build host server

# Database
bun db:migrate       # Run migrations
bun db:push          # Push schema changes
bun db:studio        # Open Drizzle Studio

# Testing
bun test             # Run all tests
bun typecheck        # Type checking
```

## Development Workflow

1. **Make changes** to any workspace (ui/, api/, host/)
2. **Hot reload** works automatically during development
3. **Build & deploy** independently:
   - `bun build:ui` → uploads to CDN → updates `bos.config.json`
   - `bun build:api` → uploads to CDN → updates `bos.config.json`
   - Host automatically loads new versions!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed development workflow.

## Related Projects

- **[every-plugin](https://github.com/near-everything/every-plugin)** - Plugin framework for modular APIs
- **[near-kit](https://kit.near.tools)** - Unified NEAR Protocol SDK
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** - NEAR authentication for Better-Auth

## License

MIT
