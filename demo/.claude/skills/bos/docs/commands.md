# BOS CLI Commands

Complete reference for all `bos` commands.

## Development

### `bos dev`

Start development server with configurable remote/local modes.

```bash
bos dev                      # Full local development
bos dev --host remote        # Remote host, local UI + API (typical)
bos dev --ui remote          # Remote UI, local host + API
bos dev --api remote         # Remote API, local host + UI
bos dev --proxy              # Proxy API requests to production
bos dev -p 3001              # Custom port
bos dev --no-interactive     # Streaming logs (no TUI)
```

### `bos start`

Run with production modules (all remotes from production URLs).

```bash
bos start                           # Default port 3000
bos start -p 8080                   # Custom port
bos start --no-interactive          # Streaming logs
bos start --account foo.near --domain gateway.foo.com  # Load config from Near Social
```

### `bos serve`

Run CLI as HTTP server (exposes /api).

```bash
bos serve                    # Default port 4000
bos serve -p 5000            # Custom port
```

## Build & Deploy

### `bos build`

Build packages locally. Updates `bos.config.json` with Zephyr URLs when deploying.

```bash
bos build                    # Build all packages
bos build ui                 # Build UI only
bos build api                # Build API only
bos build host               # Build host only
bos build ui,api             # Build multiple
bos build --force            # Force rebuild (ignore cache)
```

### `bos deploy`

Build and deploy to Zephyr Cloud.

```bash
bos deploy                   # Deploy all
bos deploy ui                # Deploy UI only
bos deploy --force           # Force rebuild
```

Requires `ZE_SERVER_TOKEN` and `ZE_USER_EMAIL` in `.env.bos` for CI/CD.

### `bos publish`

Publish `bos.config.json` to Near Social (on-chain registry).

```bash
bos publish                  # Mainnet
bos publish --network testnet
bos publish --dry-run        # Preview without sending
```

### `bos clean`

Clean build artifacts.

```bash
bos clean                    # Remove dist/ and node_modules/
```

## Project Management

### `bos create`

Scaffold new projects and remotes.

```bash
bos create project my-app              # New project
bos create project my-app -t org/repo  # Custom template
bos create ui                          # Add UI remote
bos create api                         # Add API remote
bos create host                        # Add host
bos create gateway                     # Add gateway
```

### `bos sync`

Sync dependencies and config from upstream.

```bash
bos sync                                    # From every.near/everything.dev
bos sync --account foo.near --gateway foo.com
bos sync --network testnet                  # Sync from testnet
bos sync --force                            # Force update
```

### `bos info`

Show current configuration.

```bash
bos info
```

### `bos status`

Check remote health.

```bash
bos status                   # Development endpoints
bos status -e production     # Production endpoints
```

## Gateway

### `bos gateway dev`

Run gateway locally (wrangler dev).

```bash
bos gateway dev
```

### `bos gateway deploy`

Deploy gateway to Cloudflare.

```bash
bos gateway deploy
bos gateway deploy -e staging
bos gateway deploy -e production
```

### `bos gateway sync`

Sync wrangler.toml vars from bos.config.json.

```bash
bos gateway sync
```

## Secrets (NOVA)

### `bos login`

Login to NOVA for encrypted secrets management.

```bash
bos login
```

### `bos logout`

Remove NOVA credentials.

```bash
bos logout
```

### `bos secrets sync`

Sync secrets from .env file to NOVA.

```bash
bos secrets sync --env .env.local
```

### `bos secrets set`

Set a single secret.

```bash
bos secrets set API_KEY=value
```

### `bos secrets list`

List secret keys (not values).

```bash
bos secrets list
```

### `bos secrets delete`

Delete a secret.

```bash
bos secrets delete API_KEY
```

## Registration

### `bos register`

Register a new tenant on the gateway.

```bash
bos register my-tenant              # Creates my-tenant.your-account.near
bos register my-tenant --network testnet
```

## Dependencies

### `bos deps update`

Interactive update of shared dependencies. Automatically syncs to catalog after updating.

```bash
bos deps update              # Update shared.ui deps
bos deps update api          # Update shared.api deps
```
