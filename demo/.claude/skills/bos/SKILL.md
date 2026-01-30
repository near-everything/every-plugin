---
name: bos
description: CLI for everything-dev Module Federation projects. Use when creating new BOS projects, publishing bos.config.json to Near Social, syncing with remote configs (every.near/everything.dev), running development servers (bos dev), or building/deploying federated apps. Build → publish → sync workflow for shared configuration.
---

# BOS CLI

CLI for **everything-dev** Module Federation projects with runtime-loaded configuration.

## Quick Start

```bash
# Create new project (defaults to every.near/everything.dev template)
bos create project my-app

# Or sync an existing project with the root template
bos sync

# Start development (remote host is typical workflow)
bos dev --host remote
```

## Development Workflow

**Typical development** runs host remotely while working on UI/API locally:

```bash
bos dev --host remote        # Remote host, local UI + API (typical)
bos dev --ui remote          # Isolate API work (local host + API)
bos dev --api remote         # Isolate UI work (local host + UI)
bos dev                      # Full local (initial setup only)
```

**Production mode:**

```bash
bos start --no-interactive   # All remotes, production URLs
```

## Build → Publish → Sync

The core workflow for sharing configuration:

```bash
# 1. Build apps (updates bos.config.json with Zephyr CDN URLs)
bos build

# 2. Publish config to Near Social (on-chain registry)
bos publish

# 3. Others sync from your published config
bos sync --account your.near --gateway your-gateway.com
```

**Default sync source:** `every.near/everything.dev`

## Key Commands

| Command | Description |
|---------|-------------|
| `bos create project <name>` | Scaffold new project |
| `bos sync` | Sync from every.near/everything.dev |
| `bos dev --host remote` | Development (typical) |
| `bos start --no-interactive` | Production mode |
| `bos build` | Build all packages |
| `bos publish` | Publish config to Near Social |
| `bos info` | Show current configuration |
| `bos status` | Check remote health |

For full command reference, see [commands.md](docs/commands.md).

## Configuration

All runtime configuration lives in `bos.config.json`. See [types.md](docs/types.md) for the schema.

Key fields:
- `account` - NEAR account (mainnet)
- `testnet` - NEAR account (testnet)
- `template` - Default template for scaffolding
- `app.host`, `app.ui`, `app.api` - Module configuration

## Workflow Patterns

For detailed workflow guides, see [workflows.md](docs/workflows.md):
- Creating a new project
- Syncing with upstream
- Publishing updates
- Working with secrets
- Gateway deployment

## File References

Key files for understanding the system:

- `bos.config.json` - Runtime configuration
- `demo/cli/src/types.ts` - BosConfig schema
- `demo/cli/src/cli.ts` - CLI implementation
- `demo/cli/src/plugin.ts` - Command handlers
