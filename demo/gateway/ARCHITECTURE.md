# Everything Gateway - Multi-Tenant Architecture

## Overview

The Everything Gateway enables multi-tenant hosting where any NEAR account holder can deploy their BOS application. Each gateway deployment serves a specific domain with tenants as subaccounts of the gateway account.

**Key Concepts:**
- **Gateway Account**: The NEAR account that owns the gateway (e.g., `dev.everything.near`, `efiz.near`)
- **Gateway Domain**: The domain the gateway serves (e.g., `everything.dev`, `ejlbraem.com`)
- **Tenant**: A subaccount of the gateway account (e.g., `efiz.dev.everything.near`)

## Request Resolution

### Examples

| Request | Gateway Domain | Gateway Account | Subdomain | Tenant Account | Config Path |
|---------|---------------|-----------------|-----------|----------------|-------------|
| `everything.dev` | everything.dev | dev.everything.near | _(none)_ | dev.everything.near | `dev.everything.near/bos/gateways/everything.dev/bos.config.json` |
| `efiz.everything.dev` | everything.dev | dev.everything.near | efiz | efiz.dev.everything.near | `efiz.dev.everything.near/bos/gateways/everything.dev/bos.config.json` |
| `ejlbraem.com` | ejlbraem.com | efiz.near | _(none)_ | efiz.near | `efiz.near/bos/gateways/ejlbraem.com/bos.config.json` |
| `music.ejlbraem.com` | ejlbraem.com | efiz.near | music | music.efiz.near | `music.efiz.near/bos/gateways/ejlbraem.com/bos.config.json` |

### Resolution Formula

```
Config Path: {subdomain?}.{GATEWAY_ACCOUNT}/bos/gateways/{GATEWAY_DOMAIN}/bos.config.json
```

Where:
- `GATEWAY_ACCOUNT` and `GATEWAY_DOMAIN` are configured in `wrangler.toml`
- Subdomain is extracted from the request hostname

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER REGISTRATION                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  $ bos register efiz                                                        │
│           ↓                                                                 │
│  Creates subaccount: efiz.<gateway-account>                                 │
│           ↓                                                                 │
│  Creates NOVA group: efiz.<gateway-account>-secrets                         │
│           ↓                                                                 │
│  Adds gateway as NOVA group member (authorized to read secrets)             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  TENANT PUBLISHES                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  $ bos secrets sync --env .env.local                                        │
│           ↓                                                                 │
│  Reads .env, filters to secrets defined in bos.config.json                  │
│           ↓                                                                 │
│  Encrypts client-side → uploads to NOVA (IPFS + TEE key)                    │
│           ↓                                                                 │
│  Stores CID reference                                                       │
│                                                                             │
│  $ bos publish                                                              │
│           ↓                                                                 │
│  Publishes bos.config.json to social.near:                                  │
│    <account>/bos/gateways/<gateway-domain>/bos.config.json                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  REQUEST ROUTING                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request: efiz.everything.dev OR music.ejlbraem.com                         │
│                      ↓                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Cloudflare Worker (Edge Router)                                 │       │
│  │    1. Extract hostname from request                              │       │
│  │    2. Extract subdomain using GATEWAY_DOMAIN                     │       │
│  │    3. Construct NEAR account: {subdomain}.{GATEWAY_ACCOUNT}      │       │
│  │    4. Fetch config from social.near                              │       │
│  │    5. Fetch secrets from NOVA (gateway is member)                │       │
│  │    6. Route to Container instance for this account               │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                      ↓                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Cloudflare Container (Per-Tenant Isolated)                      │       │
│  │    • Full host stack: Hono, SSR, Module Federation               │       │
│  │    • Config passed via X-Bos-Config header                       │       │
│  │    • Secrets passed via container envVars                        │       │
│  │    • Sleeps after 10m inactivity (cost-effective)                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technologies Used

### Cloudflare Containers
> Run code written in any programming language, built for any runtime, as part of apps built on Workers.
> - Docs: https://developers.cloudflare.com/containers/
> - Sandbox SDK: https://developers.cloudflare.com/sandbox/

Key features:
- Full Docker container isolation per tenant
- `sleepAfter` for cost-effective idle scaling
- Per-instance SQLite storage if needed
- Global edge deployment

### NEAR Social (social.near)
> Decentralized social graph database on NEAR Protocol.
> - Contract: `social.near`
> - SDK: `near-social-js`
> - API: `https://api.near.social`

Used for:
- Storing `bos.config.json` (tenant configuration)
- Hierarchical data storage per account
- Pattern: `<account>/bos/gateways/<domain>/bos.config.json`

### NEAR DNS
> Decentralized DNS resolving blockchain-based domain names by querying smart contracts on NEAR.
> - Public server: `185.149.40.161:53`
> - Docs: https://github.com/frol/near-dns

Each gateway parent can set up DNS for their `.near` domains:
- Deploy `dns.<account>.near` contract
- Add wildcard A record for `*.<account>.near`
- See [NEAR_DNS_SETUP.md](./docs/NEAR_DNS_SETUP.md) for details

### NOVA SDK
> Zero-knowledge encrypted file sharing with TEE-secured keys.
> - Docs: https://nova-sdk.com
> - Package: `nova-sdk-js`

Features:
- Client-side AES-256-GCM encryption
- Keys managed in TEE (Shade Agents)
- Group-based access control
- Automatic key rotation on member revocation

Used for:
- Encrypting tenant secrets
- Gateway authorized via group membership

## Gateway Configuration

### wrangler.toml

Each gateway deployment requires its own configuration:

```toml
name = "my-gateway"
main = "src/worker.ts"
compatibility_date = "2026-01-20"

[vars]
GATEWAY_DOMAIN = "mygateway.com"
GATEWAY_ACCOUNT = "myaccount.near"

[[containers]]
class_name = "TenantContainer"
image = "./Dockerfile"
max_instances = 100
```

### bos.config.json

The gateway's own bos.config.json must include the gateway field:

```json
{
  "account": "dev.everything.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "app": { ... }
}
```

## bos.config.json Schema

```json
{
  "account": "efiz.dev.everything.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://everything.dev"
  },
  "app": {
    "host": {
      "title": "My App",
      "description": "My BOS application",
      "development": "http://localhost:3000",
      "production": "https://<zephyr-url>",
      "secrets": ["HOST_DATABASE_URL", "BETTER_AUTH_SECRET"]
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://<zephyr-url>",
      "exposes": {
        "App": "./App",
        "components": "./components",
        "providers": "./providers",
        "types": "./types"
      },
      "ssr": "https://<zephyr-ssr-url>"
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://<zephyr-url>",
      "secrets": ["API_DATABASE_URL"]
    }
  }
}
```

Fields:
- `account`: NEAR account that owns this config
- `gateway`: The gateway domain this config is published for
- `app.*.secrets`: List of env var names needed (values stored in NOVA)

## CLI Commands

### Registration
```bash
bos register <name>
# Creates <name>.<gateway-account> subaccount
# Creates NOVA secrets group with gateway as member
```

### Publishing
```bash
bos publish
# Publishes bos.config.json to social.near at:
# <account>/bos/gateways/<gateway-domain>/bos.config.json
```

### Secrets Management
```bash
bos secrets sync --env .env.local
# Reads .env file, filters to defined secrets, uploads to NOVA

bos secrets set KEY=value
# Sets individual secret

bos secrets list
# Shows secret keys (not values)

bos secrets delete KEY
# Removes a secret
```

## Security Model

| Layer | Protection |
|-------|------------|
| Container isolation | Each tenant runs in own Cloudflare Container |
| Secrets encryption | Client-side AES-256-GCM, keys in TEE |
| Access control | NEAR account ownership + NOVA groups |
| Config isolation | social.near enforces account-based writes |
| Gateway trust | Explicit group membership (tenant adds gateway) |

## File Structure

```
demo/gateway/
├── wrangler.toml          # Cloudflare Worker config (GATEWAY_DOMAIN, GATEWAY_ACCOUNT)
├── Dockerfile             # Host container image
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md        # This file
├── docs/
│   └── NEAR_DNS_SETUP.md  # DNS setup guide
└── src/
    ├── worker.ts          # Edge router (Cloudflare Worker)
    ├── container.ts       # Container class definition
    ├── config.ts          # Config fetching from social.near
    ├── secrets.ts         # NOVA secrets retrieval
    └── utils.ts           # Account extraction helpers

demo/cli/src/
├── plugin.ts              # CLI with register, publish, secrets commands
└── lib/
    └── nova.ts            # NOVA SDK integration
```

## Deploying Your Own Gateway

1. **Configure wrangler.toml** with your domain and account
2. **Set up DNS** (Cloudflare for custom domains, NEAR DNS for `.near`)
3. **Deploy**: `bos gateway:deploy`
4. **Publish your config**: `bos publish`

Tenants can then register and publish their apps to your gateway.
