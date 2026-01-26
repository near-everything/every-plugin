# BOS Architecture v1.1 — Thin Gateway, Smart Proxy

## Overview

BOS (Blockchain Operating System) is a multi-tenant application platform using a **single-process gateway** architecture. The host serves multiple tenants from one process by:

1. **Resolving tenant from hostname** (e.g., `alice.gateway.example.com` → `alice.near`)
2. **Proxying API requests** to tenant-specific backends deployed on Zephyr Cloud
3. **Sharing authentication** via NEAR wallet (SIWN) with a common session store
4. **Rendering UI shell** with dynamic tenant routes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Multi-Tenant Host (Single Process)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Request → Tenant Middleware                                            │ │
│  │    1. Extract hostname from request                                     │ │
│  │    2. Resolve NEAR account from hostname                                │ │
│  │    3. Fetch/cache bos.config.json from NEAR Social                      │ │
│  │    4. Attach TenantContext to Hono context                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              ↓                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ /api/auth/* │  │ /api/rpc/* │  │ /api/*     │  │ /*          │       │
│  │             │  │             │  │             │  │             │       │
│  │ Shared Auth │  │ Proxy to   │  │ Proxy to   │  │ UI Shell +  │       │
│  │ (NEAR SIWN) │  │ Tenant API │  │ Tenant API │  │ Tenant UI   │       │
│  │             │  │ (Zephyr)   │  │ (Zephyr)   │  │ Routes      │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Shared Services (Single Instance)                                      │ │
│  │    - SessionDB: SQLite/Turso for auth sessions only                     │ │
│  │    - TenantCache: bos.config.json cached by account (60s TTL)           │ │
│  │    - Auth: Better Auth + SIWN, accepts any *.near account               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              ↓ Proxy
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
  ┌───────────┐        ┌───────────┐        ┌───────────┐
  │ Tenant A  │        │ Tenant B  │        │ Tenant C  │
  │ API       │        │ API       │        │ API       │
  │ (Zephyr)  │        │ (Zephyr)  │        │ (Zephyr)  │
  │           │        │           │        │           │
  │ + Turso   │        │ + Turso   │        │ + Turso   │
  │   DB      │        │   DB      │        │   DB      │
  └───────────┘        └───────────┘        └───────────┘
```

## Core Concepts

### 1. Tenant Resolution

Each tenant is identified by a NEAR account. The hostname maps to an account:

| Hostname | NEAR Account |
|----------|--------------|
| `gateway.example.com` | `gateway.near` (default) |
| `alice.gateway.example.com` | `alice.gateway.near` |
| `alice.near.gateway.example.com` | `alice.near` |
| Custom domain via DNS TXT | Configured account |

### 2. TenantContext (Request-Scoped)

Every request carries a `TenantContext` attached via Hono middleware:

```typescript
interface TenantContext {
  account: string;           // "alice.near"
  subdomain: string | null;  // "alice" or null for root
  config: BosConfig;         // Cached from NEAR Social
  apiUrl: string;            // "https://alice-api.zephyrcloud.app"
  uiUrl: string;             // "https://alice-ui.zephyrcloud.app"
  ssrUrl?: string;           // "https://alice-ui-ssr.zephyrcloud.app"
}
```

### 3. API Proxy Pattern

Instead of loading tenant APIs into the host process, all API calls are **proxied**:

```
Client → Host /api/campaigns → Proxy → Tenant API /campaigns → Response
```

Benefits:
- **Isolation**: Tenant code never runs in host process
- **Security**: No secrets needed in host (tenant API has its own via NOVA)
- **Simplicity**: No Module Federation for APIs, just HTTP
- **Scalability**: Tenant APIs scale independently on Zephyr

### 4. Shared Authentication

Authentication is **shared across all tenants** using NEAR wallet signatures (SIWN):

- User signs message with their NEAR wallet proving they own `user.near`
- Session stored in host's shared database
- Session includes `tenantAccount` metadata
- User stays logged in across tenant subdomains (same parent domain)

### 5. UI Shell Architecture

The host provides a **shell** that:
- Renders shared layout (navigation, footer, auth UI)
- Provides auth context to tenant UI
- Loads tenant-specific routes dynamically

```
┌─────────────────────────────────────────┐
│  Shell (Host)                           │
│  ┌───────────────────────────────────┐  │
│  │ Header (auth status, nav)         │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Tenant Routes (Dynamic)           │  │
│  │   Loaded from tenant.uiUrl        │  │
│  │   via Module Federation           │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ Footer                            │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Data Flow

### Request Lifecycle (Multi-Tenant Mode)

```
1. Request: GET https://alice.gateway.example.com/api/campaigns
   
2. Tenant Middleware:
   - hostname = "alice.gateway.example.com"
   - account = resolveAccount(hostname, "gateway.example.com", "gateway.near")
   - account = "alice.gateway.near"
   - config = await fetchConfig(account) // Cached
   - c.set("tenant", { account, config, apiUrl: config.app.api.production, ... })

3. API Route Handler:
   - tenant = c.get("tenant")
   - proxyUrl = tenant.apiUrl + "/campaigns"
   - response = await proxyRequest(req, "https://alice-api.zephyrcloud.app")
   
4. Response: campaigns data from tenant's Turso database
```

### Authentication Flow

```
1. User visits alice.gateway.example.com
2. Clicks "Sign In with NEAR"
3. SIWN popup opens, user signs message with alice.near wallet
4. Callback to /api/auth/callback/siwn
5. Host creates session:
   {
     userId: "uuid",
     nearAccountId: "alice.near",
     metadata: { tenantAccount: "alice.gateway.near" }
   }
6. Session cookie set on .gateway.example.com domain
7. User can now access alice.gateway.example.com with auth
8. Same session valid on bob.gateway.example.com (same domain)
```

### UI Rendering Flow

```
1. Request: GET https://alice.gateway.example.com/dashboard

2. Tenant Middleware:
   - Resolves tenant context

3. SSR Handler:
   - Renders shell with tenant context
   - Module Federation loads tenant's UI routes
   - Streams HTML with hydration data

4. Client Hydration:
   - Shell mounts
   - Tenant routes hydrate
   - API calls go through /api/* (proxied to tenant)
```

## Components

### Host (`host/`)

The unified gateway + host server:

```
host/
├── server.ts                     # Entry point
├── src/
│   ├── program.ts               # Hono server, route setup
│   ├── middleware/
│   │   └── tenant.ts            # Tenant resolution middleware
│   ├── services/
│   │   ├── tenant.ts            # TenantContext, resolution, caching
│   │   ├── tenant-cache.ts      # LRU cache for tenant configs
│   │   ├── config.ts            # RuntimeConfig (single-tenant compat)
│   │   ├── auth.ts              # Better Auth + SIWN
│   │   ├── database.ts          # Sessions database only
│   │   ├── federation.server.ts # UI Module Federation
│   │   ├── near-social.ts       # Fetch bos.config.json
│   │   └── proxy.ts             # API proxy utilities
│   └── db/
│       └── schema/
│           └── auth.ts          # Session tables only
```

### UI (`ui/`)

React shell with dynamic tenant routes:

```
ui/
├── src/
│   ├── App.tsx                  # Shell wrapper
│   ├── Shell.tsx                # Layout with header/footer
│   ├── TenantRoutes.tsx         # Dynamic route loader
│   ├── providers/
│   │   ├── AuthProvider.tsx     # Auth context
│   │   └── TenantProvider.tsx   # Tenant context
│   └── components/
│       ├── Header.tsx           # Nav with auth
│       └── Footer.tsx
```

### API (`api/`)

Per-tenant API deployed to Zephyr Cloud:

```
api/
├── src/
│   ├── plugin.ts                # every-plugin definition
│   ├── contract.ts              # oRPC contract
│   ├── services/
│   │   └── ...                  # Business logic
│   └── db/
│       └── schema/              # Tenant's database schema
```

Each tenant's API:
- Has its own Turso database (via NOVA secrets)
- Has its own oRPC router
- Is deployed independently to Zephyr
- Handles its own auth verification via session token

### CLI (`cli/`)

Unchanged from original, but `bos start --gateway` enables multi-tenant mode.

## Configuration

### Environment Variables (Gateway Mode)

| Variable | Description | Required |
|----------|-------------|----------|
| `GATEWAY_MODE` | Enable multi-tenant resolution | Yes |
| `GATEWAY_DOMAIN` | Base domain (e.g., `gateway.example.com`) | Yes |
| `GATEWAY_ACCOUNT` | Default NEAR account | Yes |
| `HOST_DATABASE_URL` | Sessions database URL | Yes |
| `HOST_DATABASE_AUTH_TOKEN` | Sessions database token | If Turso |
| `BETTER_AUTH_SECRET` | Session encryption | Yes |
| `BETTER_AUTH_URL` | Auth callback URL | Yes |

### bos.config.json (Per-Tenant)

```json
{
  "account": "alice.gateway.near",
  "app": {
    "host": {
      "title": "Alice's App",
      "description": "Tenant application"
    },
    "ui": {
      "name": "alice-ui",
      "development": "http://localhost:3002",
      "production": "https://alice-ui.zephyrcloud.app",
      "ssr": "https://alice-ui-ssr.zephyrcloud.app",
      "exposes": {
        "Routes": "./Routes"
      }
    },
    "api": {
      "name": "alice-api",
      "development": "http://localhost:3014",
      "production": "https://alice-api.zephyrcloud.app",
      "secrets": ["DATABASE_URL", "DATABASE_AUTH_TOKEN"]
    }
  }
}
```

## Security

### Tenant Isolation

| Concern | Mitigation |
|---------|------------|
| State leak between tenants | No tenant state in host process; API proxied |
| Secrets exposure | Tenant secrets in NOVA, only tenant API has access |
| Database access | Host only has sessions DB; tenant data in tenant DB |
| Auth token reuse | Session includes tenantAccount; validated per-request |

### Auth Security

- Sessions scoped to parent domain (`.gateway.example.com`)
- NEAR wallet signature proves account ownership
- Session metadata tracks which tenant created the session
- API proxy passes session token; tenant API validates

### Network Security

- All tenant APIs on Zephyr Cloud with TLS
- Host verifies tenant config from NEAR Social (on-chain source of truth)
- NOVA secrets encrypted at rest

## Deployment

### Single Tenant (Railway/Fly)

```bash
bos start
# Uses local bos.config.json
# Loads UI/API from configured URLs
# No GATEWAY_MODE
```

### Multi-Tenant (Rivet/Self-Hosted)

```bash
bos start --gateway
# Sets GATEWAY_MODE=true
# Resolves tenant from hostname
# Proxies API to tenant's Zephyr deployment
```

### Rivet Configuration (`rivet.toml`)

```toml
[project]
name = "bos-gateway"

[container]
dockerfile = "./Dockerfile"

[network]
ports = [{ name = "http", protocol = "https", port = 3000 }]

[resources]
cpu = 1000
memory = 1024

[env]
NODE_ENV = "production"
GATEWAY_MODE = "true"
GATEWAY_DOMAIN = "gateway.example.com"
GATEWAY_ACCOUNT = "gateway.near"
```

## Comparison: Original vs v1.1

| Aspect | Original (PLAN.md) | v1.1 (This Document) |
|--------|-------------------|----------------------|
| Process model | Container per tenant | Single process, proxy to tenant |
| Secrets in host | Injected via process.env | None (tenant API has its own) |
| Database | Per-tenant in host | Sessions only in host |
| Module Federation | UI + API loaded | UI only (API proxied) |
| Auth | Per-tenant Better Auth | Shared SIWN, session metadata |
| Complexity | Higher (container orchestration) | Lower (stateless proxy) |
| Cold start | Per-tenant container spin-up | None (proxy is instant) |
| Resource usage | Higher (N containers) | Lower (1 container + Zephyr) |

## Open Questions

### 1. Session Scope
**Current**: Shared sessions across subdomains of gateway domain.  
**Alternative**: Separate session per tenant (requires different cookie domain).

### 2. UI Loading Strategy
**Current**: Module Federation loads tenant routes.  
**Alternative**: Full proxy mode (render tenant's production URL in iframe).

### 3. Custom Domains
**Future**: Support custom domains via DNS TXT records pointing to tenant account.

### 4. Rate Limiting
**Consider**: Per-tenant rate limits on proxy to prevent abuse.

## Migration Path

From current architecture:

1. **Phase 1**: Add tenant middleware and cache (non-breaking)
2. **Phase 2**: Add API proxy route handler (feature flag)
3. **Phase 3**: Modify auth for shared sessions
4. **Phase 4**: Update UI to shell pattern
5. **Phase 5**: Add `--gateway` CLI flag
6. **Phase 6**: Remove `gateway/` directory
7. **Phase 7**: Update documentation and examples
