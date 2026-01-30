# everything-dev

Module Federation monorepo with runtime-loaded configuration, demonstrating every-plugin architecture and NEAR Protocol integration.

Built with React, Hono.js, oRPC, Better-Auth, and Module Federation.

## Quick Start

```bash
bun install             # Install dependencies
bos dev --host remote   # Start development (typical workflow)
```

Visit http://localhost:3002 (UI) and http://localhost:3014 (API).

## CLI Commands

The `bos` CLI manages all workflows. See [.claude/skills/bos/SKILL.md](.claude/skills/bos/SKILL.md) for the full skill reference.

### Development

```bash
bos dev --host remote   # Remote host, local UI + API (typical)
bos dev --ui remote     # Isolate API work
bos dev --api remote    # Isolate UI work
bos dev                 # Full local (initial setup)
```

### Production

```bash
bos start --no-interactive   # All remotes, production URLs
```

### Build & Publish

```bash
bos build               # Build all packages (updates bos.config.json)
bos publish             # Publish config to Near Social
bos sync                # Sync from every.near/everything.dev
```

### Project Management

```bash
bos create project <name>   # Scaffold new project
bos info                    # Show configuration
bos status                  # Check remote health
bos clean                   # Clean build artifacts
```

## Documentation

- **[.claude/skills/bos/SKILL.md](.claude/skills/bos/SKILL.md)** - BOS CLI skill (commands, workflows)
- **[LLM.txt](./LLM.txt)** - Technical guide for LLMs and developers
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Contribution guidelines
- **[API README](./api/README.md)** - API plugin documentation
- **[UI README](./ui/README.md)** - Frontend documentation
- **[Host README](./host/README.md)** - Server host documentation

## Architecture

**Module Federation monorepo** with runtime-loaded configuration:

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
- ✅ **Runtime Configuration** - All URLs from `bos.config.json` (no rebuild needed)
- ✅ **Independent Deployment** - UI, API, and Host deploy separately
- ✅ **Type Safety** - End-to-end with oRPC contracts
- ✅ **CDN-Ready** - Module Federation with Zephyr Cloud

## Configuration

All runtime configuration lives in `bos.config.json`:

```json
{
  "account": "every.near",
  "testnet": "althe.testnet",
  "template": "near-everything/every-plugin/demo",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "shared": {
    "ui": {
      "react": { "requiredVersion": "19.2.4", "singleton": true }
    }
  },
  "app": {
    "host": {
      "title": "App Title",
      "development": "http://localhost:3000",
      "production": "https://example.zephyrcloud.app",
      "template": "near-everything/every-plugin/demo/host",
      "sync": { "scripts": ["dev", "build", "test"] }
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://example-ui.zephyrcloud.app",
      "exposes": {
        "./Router": "./src/router.tsx",
        "./components": "./src/components/index.ts"
      }
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://example-api.zephyrcloud.app",
      "secrets": ["API_DATABASE_URL", "API_DATABASE_AUTH_TOKEN"]
    }
  }
}
```

See [.claude/skills/bos/docs/types.md](.claude/skills/bos/docs/types.md) for the complete schema.

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

## Related Projects

- **[every-plugin](https://github.com/near-everything/every-plugin)** - Plugin framework for modular APIs
- **[near-kit](https://kit.near.tools)** - Unified NEAR Protocol SDK
- **[better-near-auth](https://github.com/elliotBraem/better-near-auth)** - NEAR authentication for Better-Auth

## License

MIT
