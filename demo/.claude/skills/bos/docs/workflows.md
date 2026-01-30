# BOS Workflow Patterns

Common workflows for working with BOS projects.

## Creating a New Project

```bash
# Scaffold from the default template (every.near/everything.dev)
bos create project my-app

# Navigate and install
cd my-app
bun install

# Start development with remote host (typical workflow)
bos dev --host remote
```

The default template comes from `every.near/everything.dev` published on Near Social.

## Syncing with Upstream

Keep your project in sync with the root template:

```bash
# Sync from every.near/everything.dev (default)
bos sync

# Sync from a specific account/gateway
bos sync --account other.near --gateway other-gateway.com

# Force sync (even if versions match)
bos sync --force

# Install updated dependencies
bun install
```

What gets synced:
- Package.json catalog (shared dependencies)
- Package-level dependencies (to use `catalog:`)
- Configuration patterns

## Development Workflow

### Typical Development (Remote Host)

Most development happens with the host running remotely:

```bash
bos dev --host remote
```

This gives you:
- Fast iteration on UI and API
- No need to rebuild/restart host
- Production-like environment

### Isolating Work

When focusing on a single package:

```bash
# Working on API only
bos dev --ui remote

# Working on UI only  
bos dev --api remote

# Full local (initial setup, debugging)
bos dev
```

### Production Preview

Test with all production modules:

```bash
bos start --no-interactive
```

## Build → Publish → Sync Cycle

The core sharing workflow:

### 1. Build

Build updates `bos.config.json` with Zephyr CDN URLs:

```bash
# Build everything
bos build

# Build and deploy
bos deploy
```

After building, your `bos.config.json` has updated `production` URLs.

### 2. Publish

Publish your config to Near Social:

```bash
# Preview first
bos publish --dry-run

# Publish to mainnet
bos publish

# Or testnet
bos publish --network testnet
```

Your config is now at: `{account}/bos/gateways/{gateway}/bos.config.json`

### 3. Others Sync

Now others can sync from your published config:

```bash
bos sync --account your.near --gateway your-gateway.com
```

## Secrets Management

### Initial Setup

```bash
# Login to NOVA
bos login

# Sync existing .env file
bos secrets sync --env .env.local
```

### Day-to-Day

```bash
# Set a single secret
bos secrets set MY_API_KEY=secret-value

# List configured secrets
bos secrets list

# Delete a secret
bos secrets delete OLD_KEY
```

### In CI/CD

Secrets are retrieved at runtime via NOVA. Ensure:
1. `NOVA_ACCOUNT_ID` and `NOVA_SESSION_TOKEN` are set
2. Secrets group is registered for your account

## Gateway Deployment

### Development

```bash
# Run locally
bos gateway dev
```

### Production

```bash
# Sync config to wrangler.toml
bos gateway sync

# Deploy to Cloudflare
bos gateway deploy
```

### Multi-Environment

```bash
bos gateway deploy -e staging
bos gateway deploy -e production
```

## Dependency Management

### Update Shared Dependencies

Interactive update (like `bun update -i`):

```bash
# Update UI shared deps
bos deps update

# Update API shared deps
bos deps update api
```

### Sync to Catalog

Push bos.config.json deps to package.json catalog:

```bash
bos deps sync
bun install
```

## Multi-Tenant Setup

### Register New Tenant

```bash
# Creates {name}.{your-account}.near
bos register my-tenant

# Setup their secrets
bos secrets sync --env .env.my-tenant
```

### Tenant-Specific Config

Each tenant can have their own:
- `bos.config.json` with their account
- Published config on Near Social
- NOVA secrets group

## Debugging

### Check Configuration

```bash
bos info
```

### Check Remote Health

```bash
# Development
bos status

# Production
bos status -e production
```

### Clean State

```bash
bos clean
bun install
```
