# OpenAPI

OpenAPI specs are automatically generated from oRPC contracts and published at `/api/openapi.json`.

## Overview

Every plugin's `contract` defines valid APIs. The host aggregates all contracts and generates a unified OpenAPI spec at runtime.

```typescript
// demo/api-kv/src/contract.ts
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

export const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .tags(['health'])
    .summary('Health check')
    .description('Returns OK status'),

  getValue: oc
    .route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ value: z.string().nullable() }))
    .tags(['kv'])
    .summary('Get value by key')
    .description('Retrieves a value from the key-value store'),
});
```

## Contract Metadata

### Tags

Group routes by category:

```typescript
.ping = oc.route({
  path: '/ping',
  method: 'GET',
}).tags(['health']);  // Group all health routes
```

### Summary & Description

Document each route:

```typescript
ping = oc.route({
  path: '/ping',
  method: 'GET',
})
.summary('Health check')
.description('Returns OK status if the service is healthy')
```

### Examples

Add example responses:

```typescript
ping = oc.route({
  path: '/ping',
  method: 'GET',
}).output(z.object({
  status: z.literal('ok'),
}))
.example({
  status: 'ok'
})
```

## Spec Generation

### Host Automatically Generates Spec

```typescript
// Host's createHost()
import { createHost } from 'everything-dev';

export const host = createHost({
  // ... config

  createServerHandlers: (modules) => {
    const { openapi } = modules.api;  // Auto-generated from all plugins
    return {
      api: modules.api.router,
      ui: modules.ui.router,
      openapi,  // OpenAPI spec handler
    };
  },
});

// Host publishes /api/openapi.json automatically
```

### Spec Structure

```json
{
  "openapi": "3.1.0",
  "info": {
    "title": "API",
    "version": "1.0.0",
    "description": "Generated from everything.dev plugins"
  },
  "servers": [
    { "url": "http://localhost:3000/api" }
  ],
  "tags": [
    { "name": "health", "description": "Health check endpoints" },
    { "name": "kv", "description": "Key-value storage" }
  ],
  "paths": {
    "/ping": {
      "get": {
        "tags": ["health"],
        "summary": "Health check",
        "operationId": "ping",
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "status": { "type": "string", "enum": ["ok"] }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Publishing Spec

### Default Endpoint

```typescript
// Host automatically serves /api/openapi.json

// Client fetches spec
const spec = await fetch('http://localhost:3000/api/openapi.json');
```

### Custom Path

```typescript
createServerHandlers: (modules) => ({
  ...modules,
  openapi: {
    path: '/openapi/spec.json',
  },
}),
```

### Swagger UI Integration

```typescript
// Host can serve Swagger UI
import { createHost } from 'everything-dev';

export const host = createHost({
  // ... config

  createServerHandlers: (modules) => ({
    api: modules.api.router,
    ui: modules.ui.router,
    openapi: modules.api.openapi,
  }),
});
```

Visit `http://localhost:3000/api/docs` to view interactive docs (if configured).

## Schema Validation

### Zod to OpenAPI

Zod schemas convert to OpenAPI schemas:

```typescript
// Zod schema
output(z.object({
  id: z.string(),
  title: z.string(),
  count: z.number().min(0),
  tags: z.array(z.string()),
  active: z.boolean(),
  metadata: z.record(z.unknown()),
}))

// Equivalent OpenAPI
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "title": { "type": "string" },
    "count": { "type": "number", "minimum": 0 },
    "tags": { "type": "array", "items": { "type": "string" } },
    "active": { "type": "boolean" },
    "metadata": { "type": "object", "additionalProperties": true }
  }
}
```

### Enums

```typescript
output(z.object({
  status: z.enum(['ok', 'error', 'pending'])
}))
// → OpenAPI: status: { type: "string", enum: ["ok", "error", "pending"] }
```

### Unions

```typescript
output(z.union([
  z.object({ type: z.literal('user'), name: z.string() }),
  z.object({ type: z.literal('bot'), token: z.string() })
]))
// → OpenAPI: oneOf schemas
```

## Error Schemas

### Common Plugin Errors

```typescript
import { CommonPluginErrors } from 'every-plugin';

contract = oc.router({
  ping: oc.route({...}).errors(CommonPluginErrors)
    // Generates error schemas:
    // - UNAUTHORIZED (401)
    // - FORBIDDEN (403)
    // - NOT_FOUND (404)
    // - INTERNAL_SERVER_ERROR (500)
    // - RATE_LIMITED (429)
    // - SERVICE_UNAVAILABLE (503)
})
```

### Custom Errors

```typescript
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

const CustomErrors = {
  INVALID_INPUT: oc.error({
    code: 'INVALID_INPUT',
    message: 'Invalid input parameters',
    data: z.object({
      field: z.string(),
      reason: z.string(),
    }),
  }),
};

contract = oc.router({
  process: oc.route({...}).errors(CustomErrors)
})
```

## Documentation Generation

### Automatic from Contracts

Host reads all plugin contracts and generates unified spec:

```typescript
// Plugin 1
contract = oc.router({
  ping: oc.route({ method: 'GET', path: '/v1/ping' }).tags(['health']),
  health: oc.route({ method: 'GET', path: '/v1/health' }).tags(['health']),
});

// Plugin 2
contract = oc.router({
  getValue: oc.route({ method: 'GET', path: '/v1/kv/{key}' }).tags(['kv']),
  setValue: oc.route({ method: 'POST', path: '/v1/kv' }).tags(['kv']),
});

// Generated spec has:
// - /v1/ping, /v1/health → health tag
// - /v1/kv/{key}, /v1/kv → kv tag
```

### Example: KV Plugin Contract

```typescript
// demo/api-kv/src/contract.ts
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

export const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .tags(['health'])
    .summary('Health check')
    .description('Returns OK if service is healthy')
    .example({ status: 'ok' }),

  getValue: oc
    .route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string().min(1) }))
    .output(z.object({ value: z.string().nullable() }))
    .tags(['kv'])
    .summary('Get value')
    .description('Retrieve a value from the key-value store')
    .errors({
      NOT_FOUND: oc.error({
        code: 'NOT_FOUND',
        message: 'Key not found',
        data: z.object({ key: z.string() }),
      })
    }),

  setValue: oc
    .route({ method: 'POST', path: '/value' })
    .input(z.object({
      key: z.string().min(1).max(100),
      value: z.string().max(10000),
    }))
    .output(z.object({ success: z.literal(true) }))
    .tags(['kv'])
    .summary('Set value')
    .description('Store a value in the key-value store'),

  deleteKey: oc
    .route({ method: 'DELETE', path: '/value/{key}' })
    .input(z.object({ key: z.string().min(1) }))
    .output(z.object({ success: z.literal(true) }))
    .tags(['kv'])
    .summary('Delete key')
    .description('Remove a key from the key-value store'),

  listKeys: oc
    .route({ method: 'GET', path: '/keys' })
    .input(z.object({ limit: z.number().min(1).max(1000).default(10) }))
    .output(z.object({
      keys: z.array(z.string().min(1)),
      total: z.number().min(0),
    }))
    .tags(['kv'])
    .summary('List keys')
    .description('List all keys in the store')
    .example({ keys: ['key1', 'key2'], total: 2 }),
});
```

## Spec Customization

### Global Info

```typescript
// Set title, version, description
// Default from createHost() options:
createHost({
  createServerHandlers: (modules) => ({
    openapi: {
      info: {
        title: 'API',
        version: '1.0.0',
        description: 'Generated from everything.dev',
      },
    },
  }),
})
```

### Servers

```typescript
// Default from config:
createHost({
  createServerHandlers: (modules) => ({
    openapi: {
      servers: [
        { url: 'http://localhost:3000/api', description: 'Development' },
        { url: 'https://api.example.com', description: 'Production' },
      ],
    },
  }),
})
```

## Testing Spec

### Fetch and Validate

```typescript
const spec = await fetch('http://localhost:3000/api/openapi.json').then(r => r.json());

// Validate with OpenAPI validator
import { validate } from 'openapi-typescript-validator';
const errors = validate(spec);
if (errors.length > 0) {
  console.error('Spec errors:', errors);
}
```

### Compare Plugins

```typescript
// After adding plugin, check spec updated
const spec1 = await fetch('/api/openapi.json').then(r => r.json());
// Add plugin...
const spec2 = await fetch('/api/openapi.json').then(r => r.json());

expect(spec2.paths).toHaveProperty('/new-path');
```

## Best Practices

1. **Add tags** - Group related routes
2. **Add summary & description** - Document routes
3. **Add examples** - Show expected responses
4. **Validate schemas** - Use Zod with .min(), .max()
5. **Document errors** - Use errors in contract
6. **Update on plugin changes** - Spec regenerates automatically
7. **Version with tags** - Use /v1/, /v2/ prefix for breaking changes
8. **Keep schemas simple** - Complex unions generate messy specs

## Summary

- OpenAPI specs generate from oRPC contracts
- Host serves `/api/openapi.json` automatically
- Zod schemas convert to OpenAPI schemas
- Add tags, summaries, descriptions for docs
- Examples show expected responses
- Error schemas documented via .errors()
- Spec updates when plugins change

See **PLUGINS.md** for contract patterns and **EXAMPLES.md** for complete workflows.