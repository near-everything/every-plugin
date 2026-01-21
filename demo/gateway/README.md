# Everything Gateway

Multi-tenant gateway for the Everything platform. Enables any NEAR account to deploy their BOS application and access it via:

- `<account>.everything.dev` (traditional DNS via Cloudflare)
- `<account>.everything.near` (decentralized via NEAR DNS)

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Quick Start

### Prerequisites

- Cloudflare Workers Paid Plan (for Containers)
- NEAR account for gateway operations
- NOVA SDK account for secrets management

### Development

```bash
# Install dependencies
bun install

# Run locally
bun run dev
```

### Deployment

```bash
# Deploy to Cloudflare
bun run deploy
```

## Configuration

### Environment Variables

Set these in your Cloudflare dashboard or `wrangler.toml`:

| Variable | Description |
|----------|-------------|
| `GATEWAY_DOMAIN` | Domain for tenant resolution (e.g., `everything.dev`) |
| `GATEWAY_ACCOUNT` | NEAR account for gateway operations |
| `NOVA_SESSION_TOKEN` | NOVA SDK session token for secrets retrieval |

### DNS Setup

For NEAR DNS setup, see [docs/NEAR_DNS_SETUP.md](./docs/NEAR_DNS_SETUP.md).

For traditional DNS (Cloudflare):
1. Add wildcard CNAME: `*.everything.dev` → your worker URL
2. Enable Cloudflare proxy

## How It Works

1. **Request arrives** at `efiz.everything.dev` or `efiz.everything.near`
2. **Worker extracts** account name from hostname
3. **Fetches config** from FastFS: `efiz.everything.near.fastfs.io/fastfs.near/everything.dev/bos.config.json`
4. **Fetches secrets** from NOVA (if configured)
5. **Routes to Container** instance for that tenant
6. **Container runs** full host stack with tenant config + secrets

## Tenant Onboarding

### 1. Register (CLI)

```bash
bos register efiz
# Creates efiz.everything.near subaccount
# Creates NOVA secrets group
```

### 2. Configure Secrets

```bash
bos secrets sync --env .env.local
# Encrypts and uploads secrets to NOVA
```

### 3. Publish Config

```bash
bos publish
# Publishes bos.config.json to FastFS
```

### 4. Access

- https://efiz.everything.dev
- https://efiz.everything.near (via NEAR DNS)

## Files

```
apps/gateway/
├── wrangler.toml          # Cloudflare Worker config
├── Dockerfile             # Host container image
├── package.json
├── tsconfig.json
├── ARCHITECTURE.md        # Detailed architecture docs
├── README.md              # This file
├── docs/
│   └── NEAR_DNS_SETUP.md  # NEAR DNS configuration guide
└── src/
    ├── worker.ts          # Edge router (Cloudflare Worker)
    ├── container.ts       # Container class definition
    ├── config.ts          # Config fetching from FastFS
    ├── secrets.ts         # NOVA secrets retrieval
    └── utils.ts           # Account extraction helpers
```

## Security

| Layer | Protection |
|-------|------------|
| Container isolation | Each tenant runs in own Cloudflare Container |
| Secrets encryption | Client-side AES-256-GCM via NOVA, keys in TEE |
| Access control | NEAR account ownership + NOVA groups |
| Config isolation | FastFS enforces account-based writes |
| Gateway trust | Explicit group membership for secrets access |

## Links

- [NEAR DNS](https://github.com/frol/near-dns)
- [FastFS](https://fastfs.io)
- [NOVA SDK](https://nova-sdk.com)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
