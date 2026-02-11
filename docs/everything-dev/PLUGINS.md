# Plugins

Plugins are remote modules that expose API functionality via oRPC. They use `createPlugin()` to define contracts, implement services, and handle errors.

## Overview

### Plugin Structure

```
plugins/my-plugin/
├── src/
│   ├── contract.ts       # oRPC contract (API definition)
│   ├── service.ts        # Service class (business logic)
│   ├── index.ts          # createPlugin() export
│   └── __tests__/        # Tests
├── package.json
├── tsconfig.json
├── rsbuild.config.ts
├── vitest.config.ts
└── README.md
```

## createPlugin() API

Creates a plugin with typed contracts and services.

```typescript
import { createPlugin, CommonPluginErrors } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { oc } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

// 1. Define contract with oRPC
const contract = oc.router({
  ping: oc
    .route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .errors(CommonPluginErrors)
    .tags(['health']),

  getData: oc
    .route({ method: 'GET', path: '/data/{id}' })
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: z.object({
      id: z.string(),
      title: z.string(),
    }) }))
    .errors(CommonPluginErrors),

  // Streaming endpoint
  search: oc
    .route({ method: 'GET', path: '/search' })
    .input(z.object({ query: z.string(), limit: z.number().default(10) }))
    .output(eventIterator(z.object({
      result: z.object({ id: z.string(), score: z.number() }),
    })))
    .errors(CommonPluginErrors),
});

// 2. Create service with Effect
class MyService {
  constructor(private apiKey: string) {}

  getData(id: string) {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(`https://api.example.com/data/${id}`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        return data;
      },
      catch: (error: unknown) => new Error(`Failed: ${error}`)
    });
  }

  search(query: string, limit: number) {
    return Effect.gen(function* () {
      const generator: AsyncGenerator<{ id: string; score: number }> = (async function* () {
        for (let i = 0; i < limit; i++) {
          yield { id: `${query}-${i}`, score: 1 - (i * 0.1) };
        }
      })();
      return generator;
    });
  }
}

// 3. Export plugin
export default createPlugin({
  // Configuration schemas
  variables: z.object({
    timeout: z.number().default(10000),
  }),

  secrets: z.object({
    API_KEY: z.string(),
  }),

  context: z.object({
    userId: z.string().optional(),
  }),

  // Contract
  contract,

  // Initialize (create services)
  initialize: (config) =>
    Effect.gen(function* () {
      const service = new MyService(config.secrets.API_KEY);

      // Test connection
      yield* Effect.tryPromise(() => fetch('https://api.example.com/health'));

      return { service };
    }),

  // Shutdown
  shutdown: () => Effect.log('Shutting down...'),

  // Create router from contract
  createRouter: ({ service }, builder) => ({
    ping: builder.ping.handler(async () => ({ status: 'ok' })),

    getData: builder.getData.handler(async ({ input }) => {
      const data = await Effect.runPromise(service.getData(input.id));
      return { data };
    }),

    search: builder.search.handler(async function* ({ input }) {
      const generator = await Effect.runPromise(service.search(input.query, input.limit));

      for await (const result of generator) {
        yield result;
      }
    }),
  })
});
```

## Schema Types

### Variables

Public configuration values (non-secret):

```typescript
variables: z.object({
  timeout: z.number().default(10000),
  endpoint: z.string().url(),
  retries: z.number().min(0).max(5).default(3),
})
```

### Secrets

Sensitive values (injected from environment):

```typescript
secrets: z.object({
  API_KEY: z.string(),
  DATABASE_URL: z.string().url(),

  // Template injection
  WEBHOOK_SECRET: '{{WEBHOOK_SECRET}}',  // From Zephyr or .env
})
```

### Context

Request context values (passed from host):

```typescript
context: z.object({
  userId: z.string().optional(),
  accountId: z.string(),
  timestamp: z.string(),
})
```

## Contract Patterns

### Simple Route

```typescript
ping: oc
  .route({ method: 'GET', path: '/ping' })
  .input(z.object({}))
  .output(z.object({ status: z.literal('ok') }))
```

### With Input

```typescript
getData: oc
  .route({ method: 'GET', path: '/data/{id}' })
  .input(z.object({ id: z.string() }))
  .output(z.object({ data: DataSchema }))
```

### With Body

```typescript
createData: oc
  .route({ method: 'POST', path: '/data' })
  .input(z.object({ title: z.string(), content: z.string() }))
  .output(z.object({ data: DataSchema }))
```

### With Query Params

```typescript
listData: oc
  .route({ method: 'GET', path: '/data' })
  .input(z.object({ limit: z.number().default(10), offset: z.number().default(0) }))
  .output(z.object({ results: z.array(DataSchema), total: z.number() }))
```

### Streaming

```typescript
streamData: oc
  .route({ method: 'GET', path: '/stream' })
  .input(z.object({ limit: z.number().default(10) }))
  .output(eventIterator(z.object({ id: z.string(), score: z.number() })))
```

### With Context

```typescript
myData: oc
  .route({ method: 'GET', path: '/my-data' })
  .context(z.object({ userId: z.string() }))
  .output(z.object({ data: z.array(DataSchema) }))
```

## Service Patterns

### Simple API Calls

```typescript
class ApiService {
  constructor(private baseUrl: string, private apiKey: string) {}

  getData(id: string) {
    return Effect.tryPromise({
      try: () => fetch(`${this.baseUrl}/data/${id}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }).then(r => r.json()),
      catch: (error: unknown) => new Error(`Failed: ${String(error)}`)
    });
  }
}
```

### Database Queries

```typescript
import { DatabaseService } from 'every-plugin/database';

class DatabaseQueryService {
  constructor(private db: DatabaseService) {}

  getData(id: string) {
    return Effect.gen(function* () {
      const result = yield* db.query(
        'SELECT * FROM data WHERE id = ?',
        [id]
      );
      return result.rows[0];
    });
  }
}
```

### Cache Pattern

```typescript
import { CacheService } from 'every-plugin/cache';

class CachedApiService {
  constructor(private api: ApiService, private cache: CacheService) {}

  getData(id: string) {
    return Effect.gen(function* () {
      const cached = yield* Effect.try(() =>
        cache.get(`data:${id}`)
      );

      if (cached) return JSON.parse(cached);

      const data = yield* api.getData(id);
      yield* Effect.try(() => cache.set(`data:${id}`, JSON.stringify(data), 300));

      return data;
    });
  }
}
```

### Queue Pattern

```typescript
import { Queue } from 'every-plugin/effect';

class QueueService {
  constructor(private queue: Queue<{ task: string }>) {}

  enqueue(task: string) {
    return Effect.gen(function* () {
      yield* Queue.offer(self.queue, { task });
      return { queued: true };
    });
  }

  process() {
    return Effect.gen(function* () {
      while (true) {
        const item = yield* Queue.take(self.queue);
        yield* Effect.try(() => processItem(item.task));
        yield* Effect.yieldNow();
      }
    });
  }
}
```

## Error Handling

### Common Plugin Errors

```typescript
import { CommonPluginErrors, PluginConfigurationError } from 'every-plugin';

contract: oc.router({
  ping: oc.route(...)
    .errors(CommonPluginErrors),  // { UNAUTHORIZED, FORBIDDEN, NOT_FOUND, etc. }
```

### Transform Errors

```typescript
getData(id: string) {
  return Effect.tryPromise({
    try: () => fetch(...).then(r => {
      if (r.status === 401) throw new PluginConfigurationError({
        message: 'Invalid API credentials',
        retryable: false
      });
      if (r.status === 404) throw new Error('Not found');
      return r.json();
    }),
    catch: (error: unknown) => {
      if (error instanceof PluginConfigurationError) throw error;
      return new Error(`Failed: ${String(error)}`);
    }
  });
}
```

### Handler Error Mapping

```typescript
getData: builder.getData.handler(({ input, errors }) => {
  try {
    const data = await Effect.runPromise(service.getData(input.id));
    return { data };
  } catch (error) {
    if (error instanceof PluginConfigurationError) {
      throw errors.UNAUTHORIZED({ message: error.message });
    }
    if ((error as Error).message.includes('Not found')) {
      throw errors.NOT_FOUND({ message: 'Data not found' });
    }
    throw errors.INTERNAL_SERVER_ERROR({ message: 'Failed to fetch data' });
  }
}),
```

## Background Processing

### MemoryPublisher (Streaming)

```typescript
import { MemoryPublisher } from 'every-plugin/orpc';

initialize: (config) =>
  Effect.gen(function* () {
    const publisher = new MemoryPublisher<{
      'updates': { id: string; value: number };
    }>({
      resumeRetentionSeconds: 120,
    });

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        let i = 0;
        while (true) {
          i++;
          yield* Effect.try(() =>
            publisher.publish('updates', { id: `item-${i}`, value: i })
          );
          yield* Effect.sleep('1s');
        }
      })
    );

    return { publisher };
  }),

createRouter: (context, builder) => ({
  listenUpdates: builder.listenUpdates.handler(async function* ({ input }) {
    const iterator = context.publisher.subscribe('updates');
    // yield each update to client
  }),
})
```

### Queue (Work Distribution)

```typescript
import { Queue } from 'every-plugin/effect';

initialize: (config) =>
  Effect.gen(function* () {
    const queue = yield* Effect.acquireRelease(
      Queue.bounded(1000),
      Queue.shutdown
    );

    yield* Effect.forkScoped(
      Effect.gen(function* () {
        while (true) {
          const task = yield* Queue.take(queue);
          yield* processTask(task);
          yield* Effect.yieldNow();
        }
      })
    );

    return { queue };
  })
```

## Testing

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest';
import { MyService } from './service';
import { Effect } from 'every-plugin/effect';

describe('MyService', () => {
  it('should fetch data', async () => {
    const service = new MyService('test-key');
    const result = await Effect.runPromise(service.getData('123'));
    expect(result).toMatchObject({ id: '123' });
  });
});
```

### Integration Tests

```typescript
import { describe, it, expect } from 'vitest';
import MyPlugin from './index';

describe('MyPlugin', () => {
  it('should create router', async () => {
    const PluginClass = MyPlugin as any;
    const plugin = new PluginClass();
    const router = plugin.createRouter({}, {} as any);
    expect(router).toBeDefined();
  });
});
```

## Best Practices

1. **Use Effect for side effects** - All async operations should wrap effects
2. **Type catch as unknown** - Then check `instanceof Error`
3. **Return context from initialize** - Store in createRouter deps
4. **Use singleton: true** For shared React, React DOM, etc.
5. **Stream large datasets** - Use eventIterator for many items
6. **Add retry logic** - Effect.retry for transient failures
7. **Never log secrets** - Use template injection {{SECRET_NAME}}

## Complete Example: KV Storage Plugin

```typescript
import { createPlugin, CommonPluginErrors, PluginConfigurationError } from 'every-plugin';
import { Effect } from 'every-plugin/effect';
import { oc, eventIterator } from 'every-plugin/orpc';
import { z } from 'every-plugin/zod';

const contract = oc.router({
  ping: oc.route({ method: 'GET', path: '/ping' })
    .output(z.object({ status: z.literal('ok') }))
    .errors(CommonPluginErrors),

  getValue: oc.route({ method: 'GET', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ value: z.string().nullable() }))
    .errors(CommonPluginErrors),

  setValue: oc.route({ method: 'POST', path: '/value' })
    .input(z.object({ key: z.string(), value: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .errors(CommonPluginErrors),

  deleteKey: oc.route({ method: 'DELETE', path: '/value/{key}' })
    .input(z.object({ key: z.string() }))
    .output(z.object({ success: z.literal(true) }))
    .errors(CommonPluginErrors),

  listKeys: oc.route({ method: 'GET', path: '/keys' })
    .input(z.object({ limit: z.number().default(10) }))
    .output(z.object({ keys: z.array(z.string()) }))
    .errors(CommonPluginErrors),
});

class KvStore {
  constructor(private dbUrl: string, private authToken: string) {}

  async get(key: string): Promise<string | null> {
    const response = await fetch(`${this.dbUrl}/get`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return data.value;
  }

  async set(key: string, value: string): Promise<void> {
    const response = await fetch(`${this.dbUrl}/set`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key, value }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async delete(key: string): Promise<void> {
    const response = await fetch(`${this.dbUrl}/delete`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  async listKeys(limit: number): Promise<string[]> {
    const response = await fetch(`${this.dbUrl}/list?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.keys;
  }
}

export default createPlugin({
  variables: z.object({}),
  secrets: z.object({
    KV_DATABASE_URL: z.string().url(),
    KV_DATABASE_AUTH_TOKEN: z.string(),
  }),
  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const store = new KvStore(
        config.secrets.KV_DATABASE_URL,
        config.secrets.KV_DATABASE_AUTH_TOKEN
      );

      yield* Effect.try(() => store.get('__health__'));

      return { store };
    }),

  shutdown: () => Effect.log('Shutting down KV store'),

  createRouter: ({ store }, builder) => ({
    ping: builder.ping.handler(async () => ({ status: 'ok' })),

    getValue: builder.getValue.handler(async ({ input }) => {
      const value = await store.get(input.key);
      return { value };
    }),

    setValue: builder.setValue.handler(async ({ input }) => {
      await store.set(input.key, input.value);
      return { success: true as const };
    }),

    deleteKey: builder.deleteKey.handler(async ({ input }) => {
      await store.delete(input.key);
      return { success: true as const };
    }),

    listKeys: builder.listKeys.handler(async ({ input }) => {
      const keys = await store.listKeys(input.limit);
      return { keys };
    }),
  }),
});
```

See **CLI.md** for `add plugin` command and **EXAMPLES.md** for complete workflows.