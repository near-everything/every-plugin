# Everything Gateway - Multi-Tenant Architecture

## Overview

The Everything Gateway enables multi-tenant hosting where any NEAR account holder can deploy their BOS application and access it via:
- `<account>.everything.dev` (traditional DNS via Cloudflare)
- `<account>.everything.near` (decentralized via NEAR DNS)

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER REGISTRATION                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  $ bos register efiz                                                        │
│           ↓                                                                 │
│  Creates subaccount: efiz.everything.near                                   │
│           ↓                                                                 │
│  Creates NOVA group: efiz.everything.near-secrets                           │
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
│  $ bos publish --with-secrets                                               │
│           ↓                                                                 │
│  Publishes bos.config.json to FastFS:                                       │
│    https://efiz.everything.near.fastfs.io/fastfs.near/                      │
│    everything.dev/bos.config.json                                           │
│           ↓                                                                 │
│  Publishes secrets CID to FastFS:                                           │
│    https://efiz.everything.near.fastfs.io/fastfs.near/                      │
│    everything.dev/secrets.json                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  REQUEST ROUTING                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request: efiz.everything.dev OR efiz.everything.near                       │
│                      ↓                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  Cloudflare Worker (Edge Router)                                 │       │
│  │    1. Extract hostname from request                              │       │
│  │    2. Parse account: efiz.everything.dev → efiz                  │       │
│  │    3. Resolve to: efiz.everything.near                           │       │
│  │    4. Fetch config from FastFS                                   │       │
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

### FastFS (NEAR Protocol)
> Fast, decentralized file storage on NEAR blockchain.
> - Contract: `fastfs.near`
> - URL pattern: `https://<account>.fastfs.io/fastfs.near/<path>`

Used for:
- Storing `bos.config.json` (tenant configuration)
- Storing `secrets.json` (NOVA CID references)

### NEAR DNS
> Decentralized DNS resolving blockchain-based domain names by querying smart contracts on NEAR.
> - Public server: `185.149.40.161:53`
> - Docs: https://github.com/frol/near-dns

Setup for `everything.near`:
```bash
# Deploy DNS contract
near contract deploy dns.everything.near \
  use-file target/near/dns_contract.wasm \
  with-init-call new json-args '{}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  network-config mainnet sign-with-keychain send

# Add wildcard A record
near contract call-function as-transaction dns.everything.near dns_add \
  json-args '{"name": "*", "record": {"record_type": "A", "value": "<GATEWAY_IP>", "ttl": 300, "priority": null}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as everything.near network-config mainnet sign-with-keychain send
```

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

## bos.config.json Schema

```json
{
  "account": "efiz.everything.near",
  "gateway": "everything.dev",
  "app": {
    "host": {
      "title": "efiz app",
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
- `gateway`: Domain this config is published for (used as FastFS path)
- `app.*.secrets`: List of env var names needed (values stored in NOVA)

## CLI Commands

### Registration
```bash
bos register <name>
# Creates <name>.everything.near subaccount
# Creates NOVA secrets group with gateway as member
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

### Publishing
```bash
bos publish
# Publishes bos.config.json to FastFS

bos publish --with-secrets
# Also publishes secrets CID reference
```

## Security Model

| Layer | Protection |
|-------|------------|
| Container isolation | Each tenant runs in own Cloudflare Container |
| Secrets encryption | Client-side AES-256-GCM, keys in TEE |
| Access control | NEAR account ownership + NOVA groups |
| Config isolation | FastFS enforces account-based writes |
| Gateway trust | Explicit group membership (tenant adds gateway) |

## File Structure

```
apps/gateway/
├── wrangler.toml          # Cloudflare Worker config
├── Dockerfile             # Host container image
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md        # This file
└── src/
    ├── worker.ts          # Edge router (Cloudflare Worker)
    ├── container.ts       # Container class definition
    ├── config.ts          # Config fetching from FastFS
    ├── secrets.ts         # NOVA secrets retrieval
    └── utils.ts           # Account extraction helpers

demo/cli/src/
├── plugin.ts              # Updated with register + secrets commands
└── lib/
    └── nova.ts            # NOVA SDK integration
```
