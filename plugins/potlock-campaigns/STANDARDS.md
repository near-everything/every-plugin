# Project Standards

This document defines the technical standards and metadata schemas used in this plugin project. These standards ensure consistency, discoverability, and interoperability with the NEAR ecosystem.

## Table of Contents

1. [Package Metadata Standards](#package-metadata-standards)
2. [BOS Configuration Standards](#bos-configuration-standards)
3. [Architecture Standards](#architecture-standards)
4. [References](#references)

---

## Package Metadata Standards

### Standard Fields (package.json)

All plugins must include these standard npm package fields:

```json
{
  "name": "@scope/plugin-name",
  "version": "0.0.1",
  "description": "Brief description of plugin functionality",
  "author": "Author or Organization",
  "license": "MIT",
  "keywords": ["relevant", "search", "terms"],
  "repository": {
    "type": "git",
    "url": "https://github.com/org/repo.git"
  }
}
```

**Reference**: [npm package.json documentation](https://docs.npmjs.com/cli/v10/configuring-npm/package-json)

### Plugin Metadata Schema

The `pluginMetadata` field provides structured information for plugin discovery and tooling:

```json
{
  "pluginMetadata": {
    "displayName": "Human-Readable Plugin Name",
    "category": "blockchain-indexer | data-provider | api-service",
    "blockchain": "near | ethereum | solana",
    "protocol": "protocol-name",
    "capabilities": [
      "capability-1",
      "capability-2"
    ],
    "interfaces": {
      "api": {
        "type": "rest | graphql | grpc",
        "baseUrl": "http://localhost:PORT",
        "documentation": "/path/to/docs",
        "openapi": true | false
      }
    },
    "integrations": {
      "blockchain": "Blockchain Name",
      "contract": "contract.address.near",
      "rpc": "RPC Provider Name"
    },
    "architecture": "abi-first | event-driven | polling",
    "patterns": [
      "effect-ts",
      "dependency-injection",
      "layered-architecture"
    ]
  }
}
```

#### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `displayName` | string | Yes | Human-readable plugin name for UI display |
| `category` | string | Yes | Primary category: `blockchain-indexer`, `data-provider`, `api-service` |
| `blockchain` | string | Yes | Target blockchain: `near`, `ethereum`, `solana`, etc. |
| `protocol` | string | No | Specific protocol or dApp name |
| `capabilities` | string[] | Yes | List of actions the plugin can perform (kebab-case) |
| `interfaces.api.type` | string | Yes | API type: `rest`, `graphql`, `grpc` |
| `interfaces.api.baseUrl` | string | Yes | Base URL for API access |
| `interfaces.api.documentation` | string | No | Path to API documentation |
| `interfaces.api.openapi` | boolean | No | Whether OpenAPI/Swagger is available |
| `integrations` | object | No | External systems the plugin integrates with |
| `architecture` | string | Yes | Primary architectural pattern |
| `patterns` | string[] | No | Design patterns and frameworks used |

**Inspired by**: [Eliza OS Character Schema](https://github.com/ai16z/eliza), [VSCode Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)

### Gateway Configuration

The `gateway` field enables Module Federation and remote service discovery:

```json
{
  "gateway": {
    "bundleUrl": "https://domain.com/remote-entry.js",
    "tagName": "custom-element-name",
    "remoteEntry": "./dist/remoteEntry.js"
  }
}
```

#### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bundleUrl` | string | Yes | URL to the Module Federation remote entry or API gateway |
| `tagName` | string | Yes | Custom element tag name for web component registration |
| `remoteEntry` | string | No | Local path to the bundled remote entry file |

**Reference**: [Module Federation](https://module-federation.io/), [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)

---

## BOS Configuration Standards

### bos.config.json Schema

NEAR Social (BOS) configuration for widget and service integration:

```json
{
  "account": "account.near",
  "aliases": ["./aliases.mainnet.json"],
  "index": "account.near/widget/entry-point",
  "overrides": {
    "testnet": {
      "account": "account.testnet",
      "aliases": ["./aliases.testnet.json"],
      "index": "account.testnet/widget/entry-point"
    }
  },
  "gateway": {
    "bundleUrl": "https://service-url.com/remote-entry.js",
    "tagName": "custom-element-name",
    "apiEndpoint": "http://localhost:PORT",
    "documentation": "http://localhost:PORT/docs"
  },
  "plugin": {
    "id": "@scope/plugin-name",
    "version": "0.0.1",
    "type": "indexer-service | widget | tool",
    "network": {
      "mainnet": {
        "contractId": "contract.near",
        "rpcUrl": "https://rpc.mainnet.near.org"
      },
      "testnet": {
        "contractId": "contract.testnet",
        "rpcUrl": "https://rpc.testnet.near.org"
      }
    },
    "capabilities": {
      "queries": [
        "queryName1",
        "queryName2"
      ],
      "mutations": [
        "mutationName1",
        "mutationName2"
      ]
    },
    "endpoints": {
      "resource": "/path/to/resource",
      "action": "/path/to/action"
    }
  }
}
```

### Standard BOS Fields

#### Root Level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `account` | string | Yes | Primary NEAR account (mainnet) |
| `aliases` | string[] | No | Path to alias configuration files |
| `index` | string | Yes | Default widget entry point (format: `account/widget/name`) |
| `overrides` | object | No | Network-specific configuration overrides |

#### Gateway Section

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bundleUrl` | string | Yes | URL to remote entry or service bundle |
| `tagName` | string | Yes | Web component tag name |
| `apiEndpoint` | string | No | Base API endpoint for backend services |
| `documentation` | string | No | API documentation URL |

#### Plugin Section

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique plugin identifier (matches package.json name) |
| `version` | string | Yes | Plugin version (semver) |
| `type` | string | Yes | Plugin type: `indexer-service`, `widget`, `tool` |
| `network` | object | Yes | Network-specific contract and RPC configurations |
| `capabilities.queries` | string[] | No | Read-only operations the plugin supports |
| `capabilities.mutations` | string[] | No | Write operations the plugin supports |
| `endpoints` | object | No | Map of logical names to API endpoint paths |

**Reference**: [NEAR Social (BOS) Documentation](https://docs.near.org/bos), [NEAR Social VM](https://github.com/NearSocial/VM)

---

## Architecture Standards

### Layered Architecture Pattern

This project follows a strict layered architecture where each layer has a single responsibility:

```
API Layer (src/index.ts)
    ↓
Service Layer (src/service.ts)
    ↓
Indexer Layer (src/indexer.ts)
    ↓
Contract Client Layer (src/contract-client.ts)
    ↓
Database Layer (src/store/index.ts)
    ↓
Schema Layer (src/db/schema.ts)
```

**Detailed Documentation**: See [PROMPT.md - Architecture Layers](./PROMPT.md#architecture-layers)

### ABI-First Development

All type definitions must derive from the smart contract's ABI:

1. **Source of Truth**: Contract ABI (`.abi.json`)
2. **Validation Layer**: Zod schemas (`src/abi.ts`)
3. **API Types**: Transformed types for HTTP API (`src/contract.ts`)
4. **Database Schema**: Persistence layer (`src/db/schema.ts`)

**Detailed Documentation**: See [PROMPT.md - Philosophy](./PROMPT.md#philosophy-abi-first-architecture)

### Effect-TS Pattern

All async operations and side effects must use Effect-TS:

```typescript
// ✅ Correct
Effect.tryPromise({
  try: async () => { /* operation */ },
  catch: (e) => new Error(`Failed: ${e}`)
})

// ❌ Incorrect
async function operation() {
  try {
    return await someAsyncOp();
  } catch (e) {
    throw new Error(`Failed: ${e}`);
  }
}
```

**Reference**: [Effect-TS Documentation](https://effect.website/docs/quickstart)

### Dependency Injection

Services must be defined as Context.Tag and composed via Layers:

```typescript
// Define service
export class MyService extends Context.Tag("MyService")<
  MyService,
  { readonly method: () => Effect.Effect<Result, Error> }
>() {}

// Implement service
export const MyServiceLive = Layer.effect(MyService, 
  Effect.gen(function* () {
    const dependency = yield* SomeDependency;
    return { method: () => Effect.succeed(result) };
  })
);

// Compose layers
const AppLayer = MyServiceLive.pipe(
  Layer.provide(DependencyLive)
);
```

**Detailed Documentation**: See [PROMPT.md - Effect-TS Pattern](./PROMPT.md#type-safety-effect-ts)

---

## Naming Conventions

### Files and Directories

| Pattern | Usage | Example |
|---------|-------|---------|
| `kebab-case.ts` | Source files | `contract-client.ts` |
| `PascalCase` | Class names | `CampaignService` |
| `camelCase` | Functions, variables | `fetchCampaigns` |
| `SCREAMING_SNAKE_CASE` | Constants | `API_BASE_URL` |

### API Endpoints

- Use kebab-case for paths: `/campaigns/list`, `/sync-status`
- Use plural nouns for collections: `/campaigns`, `/donations`
- Use verbs for actions: `/sync`, `/create`

### Database Schema

- Use snake_case for table and column names: `campaign_donations`, `on_chain_id`
- Prefix foreign keys with table name: `campaign_on_chain_id`
- Use descriptive index names: `campaigns_on_chain_id_idx`

**Reference**: [PostgreSQL Naming Conventions](https://www.postgresql.org/docs/current/ddl-schemas.html)

---

## Code Quality Standards

### TypeScript

- **Strict Mode**: Enable all strict TypeScript options
- **No Any**: Avoid `any` type; use `unknown` when type is truly unknown
- **Effect Types**: All async operations must return `Effect.Effect<Success, Error>`

### Testing

- Unit tests for pure functions and mappers
- Integration tests for API endpoints
- Minimum 70% code coverage

### Documentation

- JSDoc comments for public APIs
- README.md for setup and usage
- PROMPT.md for architecture and patterns
- STANDARDS.md (this file) for compliance

---

## Versioning and Release

### Semantic Versioning

Follow [semver](https://semver.org/) for version numbers:

- **Major** (1.0.0): Breaking changes to API or architecture
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

### Git Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add campaign creation endpoint
fix: correct pagination cursor handling
docs: update API documentation
refactor: simplify indexer batching logic
test: add coverage for donation queries
```

---

## References

### Official Documentation

- **Every Plugin**: https://plugin.everything.dev/
- **NEAR Kit**: https://kit.near.tools/
- **Effect-TS**: https://effect.website/docs/quickstart
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
- **NEAR Protocol**: https://docs.near.org/
- **NEAR Social (BOS)**: https://docs.near.org/bos

### Standards and Specifications

- **npm package.json**: https://docs.npmjs.com/cli/v10/configuring-npm/package-json
- **Semantic Versioning**: https://semver.org/
- **Conventional Commits**: https://www.conventionalcommits.org/
- **Module Federation**: https://module-federation.io/
- **OpenAPI Specification**: https://swagger.io/specification/
- **Web Components**: https://developer.mozilla.org/en-US/docs/Web/API/Web_components

### Inspiration and Related Projects

- **Eliza OS**: https://github.com/ai16z/eliza (Character metadata patterns)
- **VSCode Extensions**: https://code.visualstudio.com/api/references/extension-manifest
- **NEAR Social VM**: https://github.com/NearSocial/VM

---

## Compliance Checklist

When creating or updating a plugin, ensure:

- [ ] `package.json` includes all standard fields
- [ ] `package.json` has complete `pluginMetadata` section
- [ ] `package.json` has `gateway` configuration if exposing remote entry
- [ ] `bos.config.json` exists with proper network configurations
- [ ] `bos.config.json` plugin section lists all capabilities and endpoints
- [ ] Architecture follows layered pattern (see PROMPT.md)
- [ ] All async operations use Effect-TS
- [ ] Services use Context.Tag and Layer composition
- [ ] ABI types defined in `src/abi.ts` with Zod validation
- [ ] Database schema uses snake_case naming
- [ ] API endpoints use kebab-case paths
- [ ] Code passes TypeScript strict mode
- [ ] README.md is up to date
- [ ] Version follows semantic versioning

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-01 | Initial standards documentation |

---

**Note**: This standards document is a living document. Propose changes via pull request with clear rationale and references to established conventions.
