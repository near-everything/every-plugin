# Campaign Indexer Plugin: Transformation Guide

This guide explains how to transform an `every-plugin` template into a blockchain indexer plugin using the "ABI-First" architecture pattern demonstrated in this Potlock Campaign Indexer.

## Philosophy: ABI-First Architecture

The core principle is to **derive all types from the contract's ABI** using Zod validation schemas. This ensures:
- Type safety from contract to API
- Runtime validation of all blockchain data
- Single source of truth for data structures
- Automatic OpenAPI documentation via oRPC

## Tech Stack Overview

### Core Framework: `every-plugin`
**Documentation**: https://plugin.everything.dev/

`every-plugin` provides:
- **Plugin System**: `createPlugin()` to define variables, secrets, initialization, and routing
- **oRPC Integration**: Type-safe HTTP routing with automatic OpenAPI documentation
- **Effect-TS Integration**: Built-in support for Effect's composable error handling
- **Development Server**: Hot-reload development environment with rspack

Key concepts:
```typescript
createPlugin({
  contract: oc.router({ ... }),      // Define API routes
  variables: z.object({ ... }),       // Public configuration
  secrets: z.object({ ... }),         // Private credentials
  initialize: (config) => Effect,     // Setup dependencies
  createRouter: (context, builder)    // Implement handlers
})
```

### Blockchain Interaction: `near-kit`
**Documentation**: https://kit.near.tools/

`near-kit` provides:
- **View Calls**: `near.view<T>(contractId, method, args)` for read-only operations
- **Transactions**: `near.transaction(signerId).functionCall(...).send()` for writes
- **Network Configuration**: Support for mainnet/testnet with custom RPC endpoints
- **Key Management**: Built-in support for ed25519 private keys

Key patterns:
```typescript
// Read-only queries
const near = new Near({ network: { networkId, rpcUrl } });
const result = await near.view(contractId, "get_campaigns", args);

// Transaction relay
const near = new Near({ network, privateKey, defaultSignerId });
const tx = await near.transaction(signerId)
  .functionCall(contractId, method, args, { gas, attachedDeposit })
  .send();
```

### Type Safety: `Effect-TS`
**Documentation**: https://effect.website/docs/quickstart

Effect provides:
- **Effect<Success, Error, Requirements>**: Composable computations with dependency injection
- **Layer**: Dependency management and service composition
- **Context.Tag**: Type-safe service definition
- **Error Handling**: Explicit error types and recovery strategies

Key patterns:
```typescript
// Define a service
class MyService extends Context.Tag("MyService")<MyService, {
  readonly doSomething: () => Effect.Effect<Result, Error>
}>() {}

// Create implementation
const MyServiceLive = Layer.effect(MyService, Effect.gen(function* () {
  const dependency = yield* SomeDependency;
  return { doSomething: () => Effect.succeed(result) };
}));

// Use with dependency injection
const result = yield* myService.doSomething();
```

### Database: `drizzle-orm` + `@libsql/client`
**Documentation**: https://orm.drizzle.team/docs/overview

Drizzle provides:
- **Type-safe SQL**: Schema definition generates TypeScript types
- **Migrations**: Automatic migration generation with `drizzle-kit`
- **SQLite/Turso**: Local and remote database support
- **Query Builder**: Composable, type-safe queries

Key patterns:
```typescript
// Define schema
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  onChainId: integer("on_chain_id").notNull().unique(),
  name: text("name").notNull(),
  // ...
}, (t) => [
  index("campaigns_on_chain_id_idx").on(t.onChainId)
]);

// Query
const rows = await db.select().from(campaigns)
  .where(eq(campaigns.onChainId, id))
  .limit(1);
```

## Architecture Layers

The plugin is structured in distinct layers with clear responsibilities:

### 1. ABI Layer (`src/abi.ts`)
**Purpose**: Define Zod schemas matching the contract's ABI

```typescript
export const CampaignExternalSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  owner: z.string(),
  // ... exact fields from contract ABI
});
```

**Key Points**:
- Copy type definitions from the contract's `.abi.json`
- Use Zod schemas for runtime validation
- Export both schemas and inferred types

### 2. Contract Client Layer (`src/contract-client.ts`)
**Purpose**: Wrapper for read-only contract view calls with validation

```typescript
export class ContractClient extends Context.Tag("ContractClient")<
  ContractClient,
  {
    readonly fetchCampaignsPage: (opts) => Effect.Effect<CampaignExternal[], Error>;
    // ...
  }
>() {}

export const ContractClientLive = (params) =>
  Layer.effect(ContractClient, Effect.gen(function* () {
    const near = new Near({ network: { networkId, rpcUrl } });
    
    const view = <T>(method: string, args: object, schema: ZodSchema<T>) =>
      Effect.tryPromise({
        try: async () => {
          const raw = await near.view(contractId, method, args);
          return schema.parse(raw); // Validate with Zod
        },
        catch: (e) => new Error(`view ${method} failed: ${e}`)
      });
    
    return {
      fetchCampaignsPage: ({ fromIndex, limit }) =>
        view("get_campaigns", { from_index: fromIndex, limit },
             CampaignExternalSchema.array())
    };
  }));
```

**Key Points**:
- All view methods return `Effect.Effect<T, Error>`
- Zod validation ensures runtime type safety
- Errors are properly typed and handled

### 3. Database Layer (`src/db/schema.ts` + `src/store/index.ts`)

**Schema Definition**:
```typescript
export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  onChainId: integer("on_chain_id").notNull().unique(),
  // ... rest of fields
}, (t) => [
  index("campaigns_on_chain_id_idx").on(t.onChainId)
]);
```

**Store Service**:
```typescript
export class CampaignStore extends Context.Tag("CampaignStore")<
  CampaignStore,
  {
    upsertCampaign: (c: CampaignType) => Effect.Effect<void, Error>;
    listCampaigns: (input) => Effect.Effect<{items, nextCursor}, Error>;
    // ...
  }
>() {}
```

**Key Points**:
- Schema defines table structure and indexes
- Store provides typed database operations
- All operations return Effects for composability

### 4. Indexer Layer (`src/indexer.ts`)
**Purpose**: Background sync and data transformation

```typescript
export class CampaignIndexer extends Context.Tag("CampaignIndexer")<
  CampaignIndexer,
  {
    readonly backfillOnce: () => Effect.Effect<void, Error>;
    readonly syncCampaignById: (id: number) => Effect.Effect<void, Error>;
    // ...
  }
>() {}

export const CampaignIndexerLive = Layer.effect(
  CampaignIndexer,
  Effect.gen(function* () {
    const contractClient = yield* ContractClient;
    const store = yield* CampaignStore;
    
    // Map ABI types to API types
    const mapCampaign = (raw: CampaignExternal): CampaignType => ({
      onChainId: raw.id,
      name: raw.name,
      startAt: new Date(raw.start_ms).toISOString(),
      // ... transform fields
    });
    
    const backfillOnce = () => Effect.gen(function* () {
      // Pagination logic
      let fromIndex = 0;
      while (true) {
        const raws = yield* contractClient.fetchCampaignsPage({
          fromIndex, limit: 100
        });
        if (raws.length === 0) break;
        
        for (const raw of raws) {
          yield* store.upsertCampaign(mapCampaign(raw));
        }
        fromIndex += raws.length;
      }
    });
    
    return { backfillOnce, /* ... */ };
  })
);
```

**Key Points**:
- Handles pagination and batching
- Transforms blockchain types to API types
- Manages sync state (last indexed item, errors)

### 5. Service Layer (`src/service.ts`)
**Purpose**: Business logic and transaction relay

```typescript
export class CampaignService extends Context.Tag("CampaignService")<
  CampaignService,
  {
    readonly listCampaigns: (input) => Effect.Effect<Result, Error>;
    readonly createCampaign: (input, relayer) => Effect.Effect<TxResult, Error>;
    // ...
  }
>() {}

export const CampaignServiceLive = (relayerCfg) =>
  Layer.effect(CampaignService, Effect.gen(function* () {
    const store = yield* CampaignStore;
    const indexer = yield* CampaignIndexer;
    const contractClient = yield* ContractClient;
    
    // For transactions, create separate Near instance with keys
    const relayerNear = new Near({
      network: relayerCfg.network,
      privateKey: relayerCfg.privateKey,
      defaultSignerId: relayerCfg.signerId
    });
    
    return {
      listCampaigns: (input) =>
        store.listCampaigns(input).pipe(
          Effect.map(addComputedFields)
        ),
      
      createCampaign: (input, relayer) =>
        Effect.tryPromise({
          try: async () => {
            const tx = await relayer.near.transaction(signerId)
              .functionCall(contractId, "create_campaign", args, opts)
              .send();
            
            // Parse result and sync
            const campaignId = parseTxResult(tx);
            if (campaignId) {
              await Effect.runPromise(indexer.syncCampaignById(campaignId));
            }
            
            return { transactionHash: tx.transaction.hash, campaignId };
          },
          catch: (e) => new Error(`create_campaign failed: ${e}`)
        })
    };
  }));
```

**Key Points**:
- Orchestrates multiple layers
- Computes derived fields (e.g., campaign status)
- Handles both reads and transaction relay

### 6. API Layer (`src/index.ts`)
**Purpose**: Wire everything together and expose HTTP endpoints

```typescript
export default createPlugin({
  contract: oc.router({
    listCampaigns: oc.route({ method: "POST", path: "/campaigns/list" })
      .input(ListCampaignsInput)
      .output(PaginatedCampaigns)
      .errors(CommonPluginErrors),
    // ... other routes
  }),
  
  initialize: (config) => Effect.gen(function* () {
    // Build dependency layers
    const dbLayer = DatabaseLive(config.secrets.DATABASE_URL);
    const contractLayer = ContractClientLive({ /* ... */ });
    const serviceLayer = CampaignServiceLive({ /* ... */ });
    
    // Compose layers
    const AppLayer = serviceLayer.pipe(
      Layer.provide(CampaignIndexerLive),
      Layer.provide(contractLayer),
      Layer.provide(CampaignStoreLive),
      Layer.provide(dbLayer)
    );
    
    // Optional: start background sync
    if (config.variables.SYNC_ON_STARTUP) {
      yield* Effect.gen(function* () {
        const svc = yield* CampaignService;
        yield* Effect.forkDaemon(svc.sync(false));
      }).pipe(Effect.provide(AppLayer));
    }
    
    return { appLayer: AppLayer, config };
  }),
  
  createRouter: (context, builder) => ({
    listCampaigns: builder.listCampaigns.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.listCampaigns(input);
          }).pipe(Effect.provide(context.appLayer))
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({ message: String(e), data: {} });
        });
      }
    ),
    // ... other handlers
  })
});
```

**Key Points**:
- `contract` defines the API shape
- `initialize` sets up dependencies
- `createRouter` implements handlers
- All services accessed via Effect DI

## Step-by-Step Transformation Guide

### Phase 1: Define the Contract Interface

1. **Get the ABI** (`*.abi.json`)
   - Export from your smart contract project
   - Or fetch from blockchain explorers

2. **Create `src/abi.ts`**
   ```typescript
   import { z } from "every-plugin/zod";
   
   // Copy type definitions from ABI
   export const YourEntitySchema = z.object({
     // Match ABI fields exactly
     id: z.number(),
     field_from_contract: z.string(),
     // ...
   });
   
   export type YourEntity = z.infer<typeof YourEntitySchema>;
   ```

3. **Create `src/contract.ts`** (API types)
   ```typescript
   import { oc } from "every-plugin/orpc";
   import { z } from "every-plugin/zod";
   
   // Transform ABI types to API-friendly versions
   export const YourApiEntity = z.object({
     id: z.number(),
     fieldFromContract: z.string(), // camelCase
     computedField: z.string(),     // Add computed fields
     // ...
   });
   
   // Define routes
   export const contract = oc.router({
     listEntities: oc.route({ method: "POST", path: "/entities/list" })
       .input(ListInput)
       .output(PaginatedOutput),
     // ...
   });
   ```

### Phase 2: Setup Database

1. **Create `src/db/schema.ts`**
   ```typescript
   import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
   
   export const yourEntities = sqliteTable("your_entities", {
     id: integer("id").primaryKey({ autoIncrement: true }),
     onChainId: integer("on_chain_id").notNull().unique(),
     // ... map API fields to DB columns
   }, (t) => [
     index("entity_id_idx").on(t.onChainId)
   ]);
   ```

2. **Run migrations**
   ```bash
   npm run db:generate  # Generate migration
   npm run db:push      # Apply to database
   ```

3. **Create `src/store/index.ts`**
   ```typescript
   export class YourStore extends Context.Tag("YourStore")<
     YourStore,
     {
       upsert: (entity) => Effect.Effect<void, Error>;
       list: (filters) => Effect.Effect<Result, Error>;
       // ...
     }
   >() {}
   
   export const YourStoreLive = Layer.effect(YourStore, /* ... */);
   ```

### Phase 3: Build Contract Client

1. **Create `src/contract-client.ts`**
   ```typescript
   export class ContractClient extends Context.Tag("ContractClient")<
     ContractClient,
     {
       fetchEntities: (opts) => Effect.Effect<YourEntity[], Error>;
       // ...
     }
   >() {}
   
   export const ContractClientLive = (params) =>
     Layer.effect(ContractClient, Effect.gen(function* () {
       const near = new Near({ /* ... */ });
       
       return {
         fetchEntities: ({ fromIndex, limit }) =>
           Effect.tryPromise({
             try: async () => {
               const raw = await near.view(contractId, "get_entities", args);
               return YourEntitySchema.array().parse(raw);
             },
             catch: (e) => new Error(`Failed: ${e}`)
           })
       };
     }));
   ```

### Phase 4: Implement Indexer

1. **Create `src/indexer.ts`**
   ```typescript
   export class YourIndexer extends Context.Tag("YourIndexer")<
     YourIndexer,
     {
       backfillOnce: () => Effect.Effect<void, Error>;
       syncById: (id: number) => Effect.Effect<void, Error>;
     }
   >() {}
   
   export const YourIndexerLive = Layer.effect(
     YourIndexer,
     Effect.gen(function* () {
       const contractClient = yield* ContractClient;
       const store = yield* YourStore;
       
       const mapEntity = (raw: YourEntity): YourApiEntity => ({
         // Transform fields
       });
       
       const backfillOnce = () => Effect.gen(function* () {
         // Implement pagination logic
       });
       
       return { backfillOnce, /* ... */ };
     })
   );
   ```

### Phase 5: Create Service Layer

1. **Create `src/service.ts`**
   ```typescript
   export class YourService extends Context.Tag("YourService")<
     YourService,
     {
       listEntities: (input) => Effect.Effect<Result, Error>;
       createEntity: (input, relayer) => Effect.Effect<TxResult, Error>;
     }
   >() {}
   
   export const YourServiceLive = (relayerCfg) =>
     Layer.effect(YourService, Effect.gen(function* () {
       const store = yield* YourStore;
       const indexer = yield* YourIndexer;
       
       // Optional: Create Near instance for transactions
       const relayerNear = relayerCfg.privateKey
         ? new Near({ network, privateKey, defaultSignerId })
         : null;
       
       return {
         listEntities: (input) => store.list(input),
         createEntity: (input, relayer) =>
           Effect.tryPromise({
             try: async () => {
               const tx = await relayer.near.transaction(signerId)
                 .functionCall(contractId, method, args, opts)
                 .send();
               return { transactionHash: tx.transaction.hash };
             },
             catch: (e) => new Error(`Failed: ${e}`)
           })
       };
     }));
   ```

### Phase 6: Wire Everything in Plugin

1. **Update `src/index.ts`**
   ```typescript
   export default createPlugin({
     contract,  // From src/contract.ts
     
     variables: z.object({
       RPC_URL: z.string().url(),
       CONTRACT_ID: z.string(),
       SYNC_ON_STARTUP: z.boolean().default(true)
     }),
     
     secrets: z.object({
       DATABASE_URL: z.string(),
       NETWORK: z.enum(["mainnet", "testnet"]),
       PRIVATE_KEY: z.string().optional(),
       SIGNER_ID: z.string().optional()
     }),
     
     initialize: (config) => Effect.gen(function* () {
       const dbLayer = DatabaseLive(config.secrets.DATABASE_URL);
       const contractLayer = ContractClientLive({ /* ... */ });
       const serviceLayer = YourServiceLive({ /* ... */ });
       
       const AppLayer = serviceLayer.pipe(
         Layer.provide(YourIndexerLive),
         Layer.provide(contractLayer),
         Layer.provide(YourStoreLive),
         Layer.provide(dbLayer)
       );
       
       return { appLayer: AppLayer, config };
     }),
     
     createRouter: (context, builder) => ({
       listEntities: builder.listEntities.handler(async ({ input, errors }) => {
         return await Effect.runPromise(
           Effect.gen(function* () {
             const svc = yield* YourService;
             return yield* svc.listEntities(input);
           }).pipe(Effect.provide(context.appLayer))
         ).catch((e) => {
           throw errors.SERVICE_UNAVAILABLE({ message: String(e), data: {} });
         });
       }),
       // ... other handlers
     })
   });
   ```

2. **Update `plugin.dev.ts`**
   ```typescript
   export default {
     pluginId: packageJson.name,
     port: 3014,  // Your port
     config: {
       variables: {
         RPC_URL: process.env.RPC_URL!,
         CONTRACT_ID: process.env.CONTRACT_ID!,
         SYNC_ON_STARTUP: true
       },
       secrets: {
         DATABASE_URL: process.env.DATABASE_URL || "file:./local.db",
         NETWORK: process.env.NETWORK || "testnet",
         PRIVATE_KEY: process.env.PRIVATE_KEY || "",
         SIGNER_ID: process.env.SIGNER_ID || ""
       }
     } satisfies PluginConfigInput<typeof Plugin>
   };
   ```

## Integration Standards

> **📋 Formal Standards**: For complete metadata schemas and compliance requirements, see [STANDARDS.md](./STANDARDS.md)

### NEAR Social / BOS Integration

This plugin can be integrated into the NEAR Social (BOS) ecosystem by exposing its API as a gateway service.

**Configuration via `bos.config.json`**:
```json
{
  "account": "your-account.near",
  "gateway": {
    "bundleUrl": "https://your-plugin.com/remote-entry.js",
    "tagName": "campaign-indexer-api"
  }
}
```

The `bundleUrl` can point to:
- A Module Federation remote entry for frontend consumption
- An API documentation URL
- A service discovery endpoint

### Module Federation Pattern

For frontend widgets consuming this plugin:

1. **Expose API Types**: Export TypeScript types via Module Federation
2. **Remote Entry**: Bundle plugin metadata and type definitions
3. **Widget Integration**: BOS widgets can import types and call API

Example remote entry structure:
```typescript
// Remote entry exposes:
export { contract } from './contract';
export type { CampaignType, CampaignDonationType } from './contract';
export const API_BASE = 'https://your-plugin.com';
```

## Development Workflow

1. **Initial Setup**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run db:push
   ```

2. **Development**
   ```bash
   npm run dev  # Start dev server with hot reload
   ```
   
   Visit `http://localhost:3014/api` for API documentation

3. **Testing**
   ```bash
   npm run test         # Run tests
   npm run test:watch   # Watch mode
   ```

4. **Database Management**
   ```bash
   npm run db:studio    # Open Drizzle Studio (GUI)
   npm run db:generate  # Generate new migration
   npm run db:push      # Apply migrations
   ```

5. **Production Build**
   ```bash
   npm run build        # Build for production
   npm run type-check   # Verify types
   ```

## Common Patterns

### Error Handling
```typescript
// Always use Effect.tryPromise for async operations
const result = Effect.tryPromise({
  try: async () => { /* operation */ },
  catch: (e) => new Error(`Operation failed: ${e}`)
});

// Chain operations with pipe
const composed = operation1().pipe(
  Effect.flatMap(result1 => operation2(result1)),
  Effect.map(result2 => transform(result2)),
  Effect.catchAll(error => fallback(error))
);
```

### Pagination
```typescript
// Cursor-based pagination
const list = async (cursor?: string, limit: number = 20) => {
  const cursorId = cursor ? Number(cursor) : undefined;
  
  const rows = await db.select()
    .from(table)
    .where(cursorId ? gt(table.id, cursorId) : undefined)
    .orderBy(table.id)
    .limit(limit + 1);  // Fetch one extra to determine if there's more
  
  const items = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? String(rows[limit]!.id) : null;
  
  return { items, nextCursor };
};
```

### Background Sync
```typescript
// Fork daemon for background tasks
if (config.variables.SYNC_ON_STARTUP) {
  yield* Effect.gen(function* () {
    const svc = yield* YourService;
    yield* Effect.forkDaemon(svc.sync(false));
  }).pipe(Effect.provide(AppLayer));
}
```

## Troubleshooting

### TypeScript Errors
- Ensure all Effect returns are properly typed
- Use `yield*` (not `yield`) for Effects
- Provide all required dependencies in Layer composition

### Database Issues
- Check `drizzle.config.ts` points to correct database
- Run `npm run db:push` after schema changes
- Use `npm run db:studio` to inspect data

### NEAR Connection Errors
- Verify RPC URL is accessible
- Check contract ID exists on the network
- Ensure private key format is correct (ed25519:...)

### Runtime Errors
- Check `Effect.provide(context.appLayer)` is called
- Verify all Context.Tag dependencies are satisfied
- Use `Effect.runPromise` to execute Effects in handlers

## Additional Resources

- **Every Plugin**: https://plugin.everything.dev/
- **NEAR Kit**: https://kit.near.tools/
- **Effect-TS**: https://effect.website/docs/quickstart
- **Drizzle ORM**: https://orm.drizzle.team/docs/overview
- **oRPC**: https://orpc.dev/ (for route definition patterns)

## Next Steps

1. Study the example implementation in this repository
2. Identify your smart contract's ABI
3. Follow the transformation phases step-by-step
4. Test each layer independently before integration
5. Add comprehensive error handling and logging
6. Document your API endpoints
7. Set up monitoring and alerts for production

---

**Remember**: The key to success is the layered architecture. Each layer has a single responsibility and depends only on the layer below it. This makes the codebase maintainable, testable, and easy to reason about.
