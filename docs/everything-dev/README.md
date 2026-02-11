# everything.dev Documentation

A type-driven framework for composable remote modules.

## Quick Start

```bash
# Install CLI
npm install -g @everything-dev/cli

# Create a host application
everything-dev add host my-host

# Add a plugin
everything-dev add plugin my-plugin --template kv-storage

# Add a UI
everything-dev add ui my-app --template tanstack

# Develop locally
everything-dev dev local

# Deploy to production
everything-dev deploy

# Run production server
everything-dev run production
```

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Core concepts, account/domain/api/ui pattern, createHost() pattern
- **[CLI.md](./CLI.md)** - commands: run, dev, add plugin, add ui, deploy
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Zephyr hooks, Module Federation, build types
- **[PLUGINS.md](./PLUGINS.md)** - createPlugin() API, contracts, services, errors
- **[UI.md](./UI.md)** - SSR patterns, hydration, component exports
- **[OPENAPI.md](./OPENAPI.md)** - oRPC spec generation, documentation
- **[EXAMPLES.md](./EXAMPLES.md)** - Complete end-to-end workflows

## Core Concepts

```
everything.dev
  └─ account (every.near)
     └─ domain (everything.dev)
        ├─ api (remotes: [my-plugin])
        │   └─ plugins (createPlugin, contract, service)
        └─ ui (remote, ssr, exposes: [router, hydrate])
            ├─ SSR router
            ├─ Hydrator
            └─ Components/Hooks
```

## The .everything.dev File

Configuration like `.env` for runtime:

```json
{
  "account": "every.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "apps": {
    "api": {
      "remotes": [
        {
          "id": "my-kv-plugin",
          "remote": "https://cdn.zephyr.com/v123/kv/remoteEntry.js",
          "secrets": { "KV_DATABASE_URL": "{{KV_DATABASE_URL}}" },
          "variables": { "timeout": "30000" }
        }
      ]
    },
    "ui": {
      "remote": "https://cdn.zephyr.com/v2084/ui/remoteEntry.js",
      "ssr": "https://cdn.zephyr.com/v2088/ui-ssr/remoteEntry.server.js"
    }
  }
}
```

## Why everything.dev?

- **Simple Configuration** - `.everything.dev` files instead of complex JSON
- **Type-Safe Composition** - Automatic type inference from plugin exports
- **No Manual Federation** - Framework handles Module Federation internally
- **Simple SSR** - String-based runtime config injection
- **CLI-Based** - `everything-dev run`, `dev`, `add`, `deploy`
- **Account/Domains** - Native multi-tenant structure
- **OpenAPI-Native** - Auto-generated specs from oRPC contracts

## License

MIT