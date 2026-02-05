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

## Updating from Upstream

Keep your project in sync with the root template:

```bash
# Update from every.near/everything.dev (default)
bos update

# Update from a specific account/gateway
bos update --account other.near --gateway other-gateway.com

# Force update (even if versions match)
bos update --force

# Install updated dependencies
bun install
```

What gets synced from remote:
- `app.*.production` - Zephyr production URLs
- `app.*.ssr` - SSR URLs
- `app.*.template` - package templates
- `app.*.files` - files to sync
- `app.*.sync` - sync config (scripts)
- `app.*.proxy` - proxy URLs
- `shared` - all shared dependencies with versions
- `gateway` - gateway URLs
- `template` - scaffolding template

What stays local:
- `account` - your NEAR account
- `testnet` - your testnet account  
- `app.*.development` - local dev URLs

What gets merged:
- `app.*.secrets` - union of remote + local secrets
- `app.*.variables` - merged (local can override remote)

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

## Publish → Update Cycle

The core sharing workflow:

### 1. Publish (Full Release)

`bos publish` builds, deploys to Zephyr Cloud, and publishes config to Near Social in one step:

```bash
# Preview first
bos publish --dry-run

# Full release: build + deploy + publish to mainnet
bos publish

# Publish to testnet
bos publish --network testnet

# Publish specific packages only
bos publish ui,api
```

The publish command:
1. Builds packages locally (`bun run build`)
2. Deploys to Zephyr Cloud (updates `production` URLs in config)
3. Publishes config to Near Social

Your config is now at: `{account}/bos/gateways/{gateway}/bos.config.json`

### 2. Others Update

Now others can update from your published config:

```bash
bos update --account your.near --gateway your-gateway.com
```

### Build Only

If you need to build without deploying:

```bash
# Build all packages
bos build

# Build specific packages
bos build ui
bos build api

# Force rebuild
bos build --force
```

## Secrets Management with Nova SDK

Nova SDK provides decentralized, TEE-secured secrets management for multi-tenant applications.

### Understanding Nova Accounts

There are two Nova account types in `bos.config.json`:

```json
{
  "nova": {
    "account": "tenant.nova-sdk.near"      // YOUR Nova account (for CLI)
  },
  "gateway": {
    "nova": {
      "account": "gateway.nova-sdk.near"   // Gateway's Nova account
    }
  }
}
```

- **Tenant Nova Account** (`nova.account`): Used by CLI to upload/manage secrets
- **Gateway Nova Account** (`gateway.nova.account`): Used by gateway to retrieve secrets at runtime

### Initial Setup

1. **Create a Nova account** at [nova-sdk.com](https://nova-sdk.com)
2. **Generate an API key** from "Manage Account"
3. **Login via CLI**:

```bash
bos login --token <YOUR_API_KEY> --accountId tenant.nova-sdk.near
```

This saves credentials to `.env.bos`:
```
NOVA_ACCOUNT_ID=tenant.nova-sdk.near
NOVA_API_KEY=nova_sk_xxxxx
```

### Uploading Secrets

```bash
# Sync from .env file (uploads to "{account}-secrets" group)
bos secrets:sync .env.bos

# Set individual secret
bos secrets:set MY_API_KEY=secret-value

# List uploaded secrets
bos secrets:list

# Delete a secret
bos secrets:delete OLD_KEY
```

### How Gateway Accesses Secrets

The gateway uses its own Nova API key (`NOVA_API_KEY` in wrangler.toml secrets) to retrieve tenant secrets:

1. Tenant creates secrets group: `{account}-secrets` (e.g., `every.near-secrets`)
2. Gateway's Nova account is added as group member during registration
3. Gateway fetches secrets using its API key as an authorized member

```
Tenant uploads → "{tenant.account}-secrets" group
                        ↓
Gateway (member) → retrieves using gateway.nova.account + NOVA_API_KEY
```

### Gateway Secrets Configuration

Set the gateway's Nova API key as a Cloudflare secret:

```bash
cd demo/gateway
wrangler secret put NOVA_API_KEY
```

### CI/CD

Ensure these are set in your CI environment:
- `NOVA_ACCOUNT_ID` - Your Nova SDK account
- `NOVA_API_KEY` - Your Nova API key

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

## Docker Deployment

### Production Container

Build and run a production container that fetches config from Near Social:

```bash
# Build production image
bos docker build

# Run in background
bos docker run --detach

# Stop all containers
bos docker stop --all
```

### Agent-Ready Container

For AI agents that need to interact via RPC:

```bash
# Build development image
bos docker build --target development

# Run with RPC exposed
bos docker run --target development --mode serve --detach

# RPC available at http://localhost:4000/api/rpc
```

### Container Management

```bash
# List running processes
bos ps

# Kill all BOS processes (graceful)
bos kill

# Force kill
bos kill --force

# Stop specific container
bos docker stop <containerId>
```

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
