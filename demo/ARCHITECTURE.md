# BOS Architecture

## Overview

BOS (Blockchain Operating System) is a multi-tenant application platform that uses Module Federation to dynamically load UI and API remotes, with configuration stored on-chain via NEAR Social and secrets managed through NOVA SDK.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BOS Platform                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │ NEAR Social │     │ NOVA SDK    │     │ Zephyr Cloud│                   │
│  │ (Config)    │     │ (Secrets)   │     │ (Remotes)   │                   │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│         │                   │                   │                          │
│         ▼                   ▼                   ▼                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Host Container                                │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  TenantBootstrap                                               │ │  │
│  │  │    - Resolve account from BOS_ACCOUNT env or hostname          │ │  │
│  │  │    - Fetch bos.config.json from NEAR Social                    │ │  │
│  │  │    - Fetch secrets from NOVA                                   │ │  │
│  │  │    - Inject into process.env                                   │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                              ↓                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Hono Server (program.ts)                                      │ │  │
│  │  │    /api/auth/*  → Better Auth                                  │ │  │
│  │  │    /api/rpc/*   → oRPC Handler                                 │ │  │
│  │  │    /api/*       → OpenAPI Handler                              │ │  │
│  │  │    /*           → SSR (Module Federation UI)                   │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  │                              ↓                                      │  │
│  │  ┌────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Module Federation Remotes                                     │ │  │
│  │  │    UI  → bos.config.app.ui.production (SSR + client)           │ │  │
│  │  │    API → bos.config.app.api.production (routes loaded)         │ │  │
│  │  └────────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. bos.config.json

The configuration file that defines an application:

```json
{
  "account": "alice.near",
  "gateway": {
    "development": "http://localhost:8787",
    "production": "https://gateway.example.com"
  },
  "app": {
    "host": {
      "title": "My App",
      "description": "Description",
      "development": "http://localhost:3000",
      "production": "https://host.zephyrcloud.app",
      "remote": "https://host-remote.zephyrcloud.app",
      "secrets": ["HOST_DATABASE_URL", "HOST_DATABASE_AUTH_TOKEN", "BETTER_AUTH_SECRET"]
    },
    "ui": {
      "name": "ui",
      "development": "http://localhost:3002",
      "production": "https://ui.zephyrcloud.app",
      "ssr": "https://ui-ssr.zephyrcloud.app",
      "exposes": {
        "App": "./App",
        "components": "./components",
        "providers": "./providers"
      }
    },
    "api": {
      "name": "api",
      "development": "http://localhost:3014",
      "production": "https://api.zephyrcloud.app",
      "secrets": ["API_DATABASE_URL"]
    }
  }
}
```

### 2. Multi-Tenancy

Each tenant is identified by a NEAR account (e.g., `alice.near`). The tenant's configuration and secrets are stored:

- **Configuration**: `social.near` contract at path `{account}/bos/gateways/{domain}/bos.config.json`
- **Secrets Reference**: `social.near` contract at path `{account}/bos/gateways/{domain}/secrets.json`
- **Secrets Data**: NOVA encrypted storage, accessed via CID from secrets reference

### 3. Module Federation

The host dynamically loads remotes at runtime:

- **UI Remote**: Provides React components, SSR rendering
- **API Remote**: Provides oRPC router procedures

Remotes are deployed to Zephyr Cloud and URLs stored in `bos.config.json`.

## Components

### Host (`host/`)

The main application server:

```
host/
├── server.ts           # Entry point: runServer()
├── bootstrap.ts        # BootstrapConfig types
├── src/
│   ├── program.ts      # createStartServer(), Hono app
│   ├── layers.ts       # Effect service layers
│   └── services/
│       ├── config.ts       # RuntimeConfig from bootstrap/env
│       ├── auth.ts         # Better Auth setup
│       ├── database.ts     # Turso/LibSQL connection
│       ├── federation.server.ts  # Module Federation loader
│       ├── plugins.ts      # Plugin loading
│       ├── router.ts       # oRPC router composition
│       └── context.ts      # Request context creation
```

**Key exports:**
- `runServer(bootstrap?: BootstrapConfig): ServerHandle` - Starts server with optional config injection
- `ServerHandle.ready: Promise<void>` - Resolves when server is listening
- `ServerHandle.shutdown(): Promise<void>` - Graceful shutdown

### UI (`ui/`)

React application with SSR support:

```
ui/
├── rsbuild.config.ts   # Module Federation config
└── src/
    ├── App.tsx         # Main app component
    ├── routes/         # TanStack Router routes
    ├── components/     # Shared components
    ├── providers/      # React providers
    └── lib/
        └── auth-client.ts  # Better Auth client
```

**Module Federation Exposes:**
- `./App` - Root application
- `./components` - Component library
- `./providers` - Provider components
- `./types` - TypeScript types
- `./Router` - SSR router for server rendering

### API (`api/`)

Plugin-based API with oRPC:

```
api/
├── rspack.config.cjs   # Module Federation config
└── src/
    ├── plugin.ts       # every-plugin definition
    ├── contract.ts     # oRPC contract
    └── services/       # Business logic
```

**Module Federation Exposes:**
- `./Plugin` - Plugin module

### CLI (`cli/`)

Command-line interface for development and deployment:

```
cli/
└── src/
    ├── cli.ts          # Commander setup
    ├── plugin.ts       # every-plugin implementation
    ├── config.ts       # bos.config.json loading
    └── lib/
        ├── nova.ts         # NOVA SDK integration
        ├── near-cli.ts     # NEAR CLI integration
        ├── orchestrator.ts # Dev process management
        └── env.ts          # Environment handling
```

**Commands:**
- `bos dev` - Local development with hot reload
- `bos start` - Production mode with remote loading
- `bos build` - Build and deploy to Zephyr Cloud
- `bos publish` - Publish config to NEAR Social
- `bos gateway dev/deploy` - Gateway management
- `bos secrets sync/set/list` - NOVA secrets management
- `bos login/logout` - NOVA authentication
- `bos register` - Create tenant subaccount

## Data Flow

### Development Mode (`bos dev`)

```
CLI → Orchestrator → [UI Process, API Process, Host Process]
                           ↓
         Host loads UI/API from localhost URLs
```

### Production Mode (`bos start`)

```
CLI → Host Process
         ↓
      1. TenantBootstrap resolves account
      2. Fetch bos.config.json from NEAR Social
      3. Fetch secrets from NOVA
      4. Load UI/API from Zephyr URLs via Module Federation
      5. Serve requests
```

### Multi-Tenant Mode (Gateway)

```
Request → Gateway Container
            ↓
         1. Resolve tenant from hostname
         2. Fetch tenant config from NEAR Social
         3. Fetch secrets from NOVA
         4. Start/route to tenant host container
         5. Proxy request with secrets injected
```

## Security

### Secrets Management

1. **Local Development**: `.env.local` file with secrets
2. **Production**: NOVA SDK encrypted storage
   - Developer uploads secrets: `bos secrets sync --env .env.local`
   - Reference published to NEAR Social: `{account}/bos/gateways/{domain}/secrets.json`
   - Gateway/Host fetches at startup using NOVA API key

### Authentication

- **Better Auth** handles user authentication
- **NEAR Wallet** integration via `better-near-auth`
- Session stored in HTTP-only cookies

### TEE Support (Future)

- Container runs in Trusted Execution Environment (Phala/Marlin)
- NOVA API key sealed at deploy time
- Attestation endpoint for verification

## Deployment Options

### Option 1: Single Tenant (Railway/Fly.io)

```bash
# Build and deploy remotes
bos build

# Publish config
bos publish

# Deploy container
docker build -t my-app .
# Set BOS_ACCOUNT, NOVA_API_KEY env vars
```

### Option 2: Multi-Tenant (Rivet)

```bash
# Deploy to Rivet Cloud
bos gateway deploy

# Rivet manages container per tenant
# Auto-scaling based on request load
```

### Option 3: Self-Hosted TEE

```bash
# Deploy Rivet Engine in TEE enclave
# Seal NOVA_API_KEY at deploy
# Containers inherit TEE guarantees
```

## Configuration Reference

### Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `BOS_ACCOUNT` | NEAR account for tenant resolution | Deployment config |
| `NOVA_API_KEY` | NOVA SDK API key | Deployment secret |
| `PORT` | Server port | Default: 3000 |
| `NODE_ENV` | Environment | production/development |
| `HOST_DATABASE_URL` | Turso database URL | NOVA secrets |
| `HOST_DATABASE_AUTH_TOKEN` | Turso auth token | NOVA secrets |
| `BETTER_AUTH_SECRET` | Auth encryption secret | NOVA secrets |
| `BETTER_AUTH_URL` | Auth callback URL | NOVA secrets |

### bos.config.json Schema

```typescript
interface BosConfig {
  account: string;                    // NEAR account
  gateway: {
    development: string;              // Local gateway URL
    production: string;               // Production gateway URL
  };
  create?: {                          // Template URLs for scaffolding
    project?: string;
    ui?: string;
    api?: string;
    host?: string;
  };
  app: {
    host: HostConfig;
    ui: UIConfig;
    api: APIConfig;
    [key: string]: RemoteConfig;      // Additional remotes
  };
}

interface HostConfig {
  title: string;
  description?: string;
  development: string;
  production: string;
  remote?: string;                    // Module Federation remote URL
  secrets?: string[];                 // Required secret keys
}

interface UIConfig {
  name: string;
  development: string;
  production: string;
  ssr?: string;                       // SSR endpoint URL
  exposes: Record<string, string>;    // Module Federation exposes
}

interface APIConfig {
  name: string;
  development: string;
  production: string;
  variables?: Record<string, string>;
  secrets?: string[];
}
```
