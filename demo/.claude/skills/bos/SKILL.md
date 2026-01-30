---
name: bos
description: CLI for everything-dev Module Federation projects. Use when creating new BOS projects, publishing bos.config.json to Near Social, syncing with remote configs (every.near/everything.dev), running development servers (bos dev), or building/deploying federated apps. Deploy → publish → sync workflow for shared configuration.
---

# BOS CLI

CLI for **everything-dev** Module Federation projects with runtime-loaded configuration.

## Quick Start

```bash
# Create new project (defaults to every.near/everything.dev template)
bos create project my-app

# Or sync an existing project with the root template
bos sync

# Start development (auto-detects missing packages → uses remote)
bos dev
```

## Development Workflow

**Auto-detection**: The CLI automatically detects which packages exist locally and uses remote mode for missing ones. No need to explicitly specify `--host=remote`, `--ui=remote`, etc.

```bash
bos dev                      # Auto-detects: missing packages use remote
bos dev --host remote        # Explicit remote host (optional)
bos dev --ui remote          # Explicit remote UI (optional)  
bos dev --api remote         # Explicit remote API (optional)
```

**Example output** when packages are missing:
```
  ⚙ Auto-detecting packages...
    host not found locally → using remote
    api not found locally → using remote
```

**Production mode:**

```bash
bos start --no-interactive   # All remotes, production URLs
```

## Deploy → Publish → Sync

The core workflow for sharing configuration:

```bash
# 1. Deploy apps to Zephyr (updates bos.config.json with production URLs)
bos deploy

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
| `bos dev` | Development (auto-detects missing packages) |
| `bos start --no-interactive` | Production mode |
| `bos build` | Build existing packages (skips missing) |
| `bos deploy` | Deploy existing packages to Zephyr |
| `bos publish` | Publish config to Near Social |
| `bos info` | Show current configuration |
| `bos status` | Check remote health |

### Auto-Detection Behavior

Commands automatically detect which packages exist locally:

| Command | Missing Package Behavior |
|---------|-------------------------|
| `bos dev` | Uses remote mode |
| `bos build` | Skips package |
| `bos deploy` | Skips package |

### Process Management

| Command | Description |
|---------|-------------|
| `bos ps` | List all tracked BOS processes |
| `bos kill` | Kill all tracked processes (graceful SIGTERM → SIGKILL) |
| `bos kill --force` | Force kill all processes immediately (SIGKILL) |

Process tracking uses `.bos/pids.json` to track spawned processes for cleanup.

### Docker Commands

| Command | Description |
|---------|-------------|
| `bos docker build` | Build production Docker image |
| `bos docker build --target development` | Build development/agent-ready image |
| `bos docker build --no-cache` | Build without cache |
| `bos docker run` | Run container in production mode |
| `bos docker run --detach` | Run container in background |
| `bos docker run --target development --mode serve` | Run agent-ready container (RPC exposed) |
| `bos docker stop <containerId>` | Stop specific container |
| `bos docker stop --all` | Stop all BOS containers |

**Docker modes:**
- `start` (default): Production mode, fetches config from Near Social
- `serve`: Exposes CLI as RPC API (agent-ready)
- `dev`: Full development mode

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
