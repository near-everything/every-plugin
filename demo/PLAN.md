# BOS Implementation Plan

## Goals

1. **Rivet Containers** - Replace Cloudflare Containers with Rivet for flexible deployment
2. **Multi-Tenant via NEAR Account** - Each tenant identified by NEAR account
3. **TEE Support** - Ability to run in secure Trusted Execution Environments
4. **Simple CLI** - `bos start` handles everything, `bos.config.json` drives configuration
5. **NOVA Secrets** - Encrypted secrets per tenant, fetched at container startup

---

## Phase 1: Unified Host with TenantBootstrap

**Goal**: Merge gateway functionality into host so `bos start` can serve multi-tenant

### 1.1 Create TenantBootstrap Service

Create `host/src/services/tenant-bootstrap.ts`:

```typescript
import { NovaSdk } from "nova-sdk-js";
import type { BosConfig } from "./config";

interface TenantBootstrapConfig {
  account: string;           // From BOS_ACCOUNT env or hostname resolution
  gatewayDomain: string;     // From GATEWAY_DOMAIN env
  novaApiKey?: string;       // From NOVA_API_KEY env
}

export class TenantBootstrap {
  static async initialize(config: TenantBootstrapConfig): Promise<{
    bosConfig: BosConfig;
    secrets: Record<string, string>;
  }> {
    // 1. Fetch bos.config.json from NEAR Social
    const bosConfig = await this.fetchConfig(config.account, config.gatewayDomain);
    
    // 2. Fetch secrets from NOVA if API key provided
    const secrets = config.novaApiKey 
      ? await this.fetchSecrets(config.account, config.gatewayDomain, config.novaApiKey)
      : {};
    
    // 3. Inject secrets into process.env
    for (const [key, value] of Object.entries(secrets)) {
      process.env[key] = value;
    }
    
    return { bosConfig, secrets };
  }
  
  private static async fetchConfig(account: string, domain: string): Promise<BosConfig> {
    const key = `${account}/bos/gateways/${domain}/bos.config.json`;
    const response = await fetch("https://api.near.social/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [key] }),
    });
    // ... parse response
  }
  
  private static async fetchSecrets(
    account: string, 
    domain: string, 
    apiKey: string
  ): Promise<Record<string, string>> {
    // 1. Fetch secrets reference from NEAR Social
    const secretsRef = await this.fetchSecretsRef(account, domain);
    if (!secretsRef) return {};
    
    // 2. Fetch from NOVA
    const nova = new NovaSdk(account, { apiKey });
    const groupId = `${account}-secrets`;
    const result = await nova.retrieve(groupId, secretsRef.cid);
    const data = JSON.parse(result.data.toString());
    return data.secrets || {};
  }
}
```

### 1.2 Update Host Server Entry

Modify `host/server.ts` to use TenantBootstrap:

```typescript
import "dotenv/config";
import { TenantBootstrap } from "./src/services/tenant-bootstrap";
import { runServer } from "./src/program";

async function main() {
  const account = process.env.BOS_ACCOUNT;
  const gatewayDomain = process.env.GATEWAY_DOMAIN;
  const novaApiKey = process.env.NOVA_API_KEY;
  
  if (account && gatewayDomain) {
    // Multi-tenant mode: bootstrap from NEAR Social
    const { bosConfig, secrets } = await TenantBootstrap.initialize({
      account,
      gatewayDomain,
      novaApiKey,
    });
    
    runServer({
      gatewayConfig: bosConfig,
      gatewaySecrets: secrets,
      host: { url: `http://localhost:${process.env.PORT || 3000}` },
    });
  } else {
    // Single-tenant mode: use local config
    runServer();
  }
}

main();
```

### 1.3 Files to Create/Modify

| File | Action |
|------|--------|
| `host/src/services/tenant-bootstrap.ts` | Create |
| `host/src/services/nova.ts` | Create (NOVA SDK helpers) |
| `host/server.ts` | Modify (add TenantBootstrap) |
| `host/package.json` | Add `nova-sdk-js` dependency |

---

## Phase 2: Update CLI for NOVA API Key

**Goal**: Update NOVA authentication to use `apiKey` instead of `sessionToken`

### 2.1 Update nova.ts

Modify `cli/src/lib/nova.ts`:

```typescript
export interface NovaConfig {
  accountId: string;
  apiKey: string;  // Changed from sessionToken
}

export function createNovaClient(config: NovaConfig): NovaSdk {
  return new NovaSdk(config.accountId, {
    apiKey: config.apiKey,  // Changed from sessionToken
  });
}
```

### 2.2 Update Login Command

Modify `cli/src/cli.ts` login command:

```typescript
program
  .command("login")
  .action(async () => {
    // Update prompts for API key
    const apiKey = await input({
      message: "API Key (starts with nova_sk_...):",
      validate: (value) => value.startsWith("nova_sk_") || "Invalid API key format",
    });
  });
```

### 2.3 Files to Modify

| File | Action |
|------|--------|
| `cli/src/lib/nova.ts` | sessionToken → apiKey |
| `cli/src/cli.ts` | Update login prompts |
| `cli/src/plugin.ts` | Update login handler |

---

## Phase 3: Enhanced `bos start` Command

**Goal**: `bos start` supports both single-tenant and multi-tenant modes

### 3.1 Current Behavior (Keep)

```bash
# Single tenant - uses local bos.config.json
bos start

# Single tenant - fetches from NEAR Social
bos start --account alice.near --domain gateway.example.com
```

### 3.2 Enhanced Behavior (Add)

```bash
# Multi-tenant gateway mode - resolves tenant from hostname
bos start --gateway

# With specific port
bos start --gateway --port 8787
```

### 3.3 Implementation

Update `cli/src/plugin.ts` start handler:

```typescript
start: builder.start.handler(async ({ input }) => {
  const env: Record<string, string> = {
    NODE_ENV: "production",
  };
  
  if (input.gateway) {
    // Gateway mode - each request can be for different tenant
    env.GATEWAY_MODE = "true";
    env.GATEWAY_DOMAIN = getGatewayDomain(bosConfig);
    env.GATEWAY_ACCOUNT = bosConfig.account;
  } else if (input.account && input.domain) {
    // Specific tenant mode
    env.BOS_ACCOUNT = input.account;
    env.GATEWAY_DOMAIN = input.domain;
  }
  
  if (process.env.NOVA_API_KEY) {
    env.NOVA_API_KEY = process.env.NOVA_API_KEY;
  }
  
  // Start host with env vars
  startApp({
    packages: ["host"],
    env,
    // ...
  });
});
```

---

## Phase 4: Rivet Integration

**Goal**: Deploy unified host container to Rivet

### 4.1 Create rivet.toml

Create `host/rivet.toml`:

```toml
[project]
name = "bos-host"

[container]
dockerfile = "./Dockerfile"

[network]
ports = [
  { name = "http", protocol = "https", port = 3000 }
]

[resources]
cpu = 1000
memory = 1024

[env]
NODE_ENV = "production"
```

### 4.2 Update Dockerfile

Modify `host/Dockerfile`:

```dockerfile
FROM oven/bun:latest

WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN bun run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
```

### 4.3 Add Gateway Commands for Rivet

Update CLI:

```typescript
gateway
  .command("dev")
  .description("Run gateway locally")
  .action(async () => {
    // Start host with GATEWAY_MODE=true
    const result = await client.start({
      gateway: true,
      port: 8787,
    });
  });

gateway
  .command("deploy")
  .description("Deploy to Rivet")
  .option("--self-hosted <url>", "Self-hosted Rivet endpoint")
  .action(async () => {
    // Build and deploy to Rivet
    const { execa } = await import("execa");
    await execa("rivet", ["deploy"], { cwd: hostDir, stdio: "inherit" });
  });
```

### 4.4 Files to Create/Modify

| File | Action |
|------|--------|
| `host/rivet.toml` | Create |
| `host/Dockerfile` | Modify |
| `cli/src/plugin.ts` | Update gateway commands |
| `cli/src/cli.ts` | Update gateway commands |

---

## Phase 5: Multi-Tenant Hostname Resolution

**Goal**: Gateway mode resolves tenant from hostname

### 5.1 Add Hostname Resolution to Host

Modify `host/src/services/tenant-bootstrap.ts`:

```typescript
export class TenantBootstrap {
  static resolveAccountFromHostname(
    hostname: string,
    gatewayDomain: string,
    gatewayAccount: string
  ): string | null {
    // gateway.example.com → gatewayAccount
    if (hostname === gatewayDomain) {
      return gatewayAccount;
    }
    
    // alice.gateway.example.com → alice.gatewayAccount
    if (hostname.endsWith(`.${gatewayDomain}`)) {
      const subdomain = hostname.slice(0, -(gatewayDomain.length + 1));
      return subdomain.endsWith(".near") ? subdomain : `${subdomain}.${gatewayAccount}`;
    }
    
    return null;
  }
}
```

### 5.2 Request-Level Tenant Resolution (Gateway Mode)

For full multi-tenant support, add middleware:

```typescript
// host/src/middleware/tenant.ts
import { TenantBootstrap } from "../services/tenant-bootstrap";

const tenantCache = new Map<string, TenantContext>();

export async function tenantMiddleware(c: Context, next: Next) {
  if (!process.env.GATEWAY_MODE) {
    return next();
  }
  
  const hostname = new URL(c.req.url).hostname;
  const account = TenantBootstrap.resolveAccountFromHostname(
    hostname,
    process.env.GATEWAY_DOMAIN!,
    process.env.GATEWAY_ACCOUNT!
  );
  
  if (!account) {
    return c.json({ error: "Tenant not found" }, 404);
  }
  
  // Check cache
  let tenant = tenantCache.get(account);
  if (!tenant) {
    tenant = await TenantBootstrap.initialize({
      account,
      gatewayDomain: process.env.GATEWAY_DOMAIN!,
      novaApiKey: process.env.NOVA_API_KEY,
    });
    tenantCache.set(account, tenant);
  }
  
  // Attach to context
  c.set("tenant", tenant);
  return next();
}
```

---

## Phase 6: TEE Support

**Goal**: Containers can run in Trusted Execution Environments

### 6.1 Add Attestation Endpoint

```typescript
// host/src/routes/attestation.ts
app.get("/.well-known/attestation", (c) => {
  // Return TEE attestation document
  const attestation = process.env.TEE_ATTESTATION;
  if (!attestation) {
    return c.json({ tee: false });
  }
  return c.json({ tee: true, attestation });
});
```

### 6.2 Seal NOVA API Key

For Phala deployment, the NOVA API key is sealed at deploy time:

```bash
# Deploy to Phala with sealed secret
phala deploy --seal NOVA_API_KEY=$NOVA_API_KEY
```

### 6.3 Verify Attestation in Clients

```typescript
// ui/src/lib/attestation.ts
export async function verifyAttestation(hostUrl: string): Promise<boolean> {
  const response = await fetch(`${hostUrl}/.well-known/attestation`);
  const data = await response.json();
  if (!data.tee) return false;
  // Verify attestation document
  return verifyPhalaAttestation(data.attestation);
}
```

---

## Phase 7: Remove Separate Gateway

**Goal**: Delete `gateway/` directory, functionality is now in `host/`

### 7.1 Files to Delete

```
gateway/
├── src/
│   ├── worker.ts      # DELETE
│   ├── program.ts     # DELETE (moved to host)
│   ├── container.ts   # DELETE
│   └── services/      # DELETE (moved to host)
├── wrangler.toml      # DELETE
├── Dockerfile         # DELETE
└── package.json       # DELETE
```

### 7.2 Update bos.config.json

Remove gateway-specific remotes since gateway is now the host:

```json
{
  "account": "alice.near",
  "gateway": {
    "development": "http://localhost:3000",
    "production": "https://host.example.com"
  },
  "app": {
    "host": { ... },
    "ui": { ... },
    "api": { ... }
  }
}
```

---

## Implementation Order

### Week 1: Foundation
1. ✅ Create ARCHITECTURE.md
2. ✅ Create PLAN.md
3. [ ] Create `host/src/services/tenant-bootstrap.ts`
4. [ ] Create `host/src/services/nova.ts`
5. [ ] Update `host/server.ts` for TenantBootstrap

### Week 2: CLI Updates
6. [ ] Update `cli/src/lib/nova.ts` for apiKey
7. [ ] Update `cli/src/cli.ts` login command
8. [ ] Enhance `bos start` with gateway mode
9. [ ] Test single-tenant and multi-tenant modes

### Week 3: Rivet Integration
10. [ ] Create `host/rivet.toml`
11. [ ] Update `host/Dockerfile`
12. [ ] Update CLI gateway commands for Rivet
13. [ ] Test local Rivet deployment

### Week 4: Production & Cleanup
14. [ ] Add hostname-based tenant resolution
15. [ ] Add TEE attestation endpoint
16. [ ] Delete `gateway/` directory
17. [ ] Update documentation

---

## Command Reference (Post-Implementation)

```bash
# Development
bos dev                     # Local dev with hot reload
bos dev --ui remote         # UI from Zephyr, API local

# Single Tenant Production
bos start                   # Use local bos.config.json
bos start --account alice.near --domain gateway.example.com

# Multi-Tenant Gateway
bos start --gateway         # Hostname-based tenant resolution
bos gateway deploy          # Deploy to Rivet Cloud

# Secrets Management
bos login                   # Enter NOVA API key
bos secrets sync            # Upload to NOVA
bos secrets set KEY=value   # Set single secret

# Tenant Management
bos register alice          # Create alice.{gateway-account}
bos publish                 # Publish bos.config.json to NEAR Social

# Build & Deploy
bos build                   # Build and deploy remotes to Zephyr
bos build --no-deploy       # Local build only
```

---

## Success Criteria

- [ ] `bos start` works for single-tenant deployment (Railway)
- [ ] `bos start --gateway` works for multi-tenant (Rivet)
- [ ] NOVA secrets loaded at container startup
- [ ] Module Federation loads UI/API from bos.config.json URLs
- [ ] TEE attestation endpoint functional
- [ ] CLI works from any directory (finds bos.config.json)
- [ ] Gateway directory can be removed
