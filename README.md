<!-- markdownlint-disable MD014 -->
<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD029 -->

<div align="center">

<img src="https://plugin.everything.dev/metadata.jpg" alt="every-plugin banner" width="100%" />

</div>

<br/>

A framework for building composable, type-safe plugin systems. It combines [Effect](https://effect.website/) for resource lifecycle management, [Module Federation](https://module-federation.io/) for remote loading, and [oRPC](https://orpc.io/) for type-safe contracts.

[![npm bundle size](https://img.shields.io/bundlephobia/minzip/every-plugin@latest)](https://bundlephobia.com/result?p=every-plugin@latest)

## Installation

```bash
bun add every-plugin
```

## Quick Start

Create a runtime and use your first plugin:

```typescript
import { createPluginRuntime } from "every-plugin/runtime";

const runtime = createPluginRuntime({
  registry: {
    "data-source": {
      remoteUrl: "https://cdn.example.com/plugins/source/remoteEntry.js",
      version: "1.0.0"
    }
  },
  secrets: {API_KEY: "secret-value" }
});

const { createClient } = await runtime.usePlugin("data-source", {
  secrets: { apiKey: "{{API_KEY}}" },
  variables: { timeout: 30000 }
});

const client = createClient();
const result = await client.search({ query: "typescript", limit: 20 });
console.log(`Found ${result.items.length} items`);

await runtime.shutdown();
```

## Core Concepts

### Plugins are Type-Safe Contracts

Plugins define their interface using [oRPC](https://orpc.io/) procedures. The runtime ensures type safety from contract definition through to client calls:

```typescript
export default createPlugin({
  initialize: () => { /* setup resources, return context */ }
  contract: oc.router({
    getData: oc.procedure
      .input(z.object({ id: z.string() }))
      .output(DataSchema),
    streamItems: oc.procedure
      .input(QuerySchema)
      .output(eventIterator(ItemSchema))
  }),
  createRouter: (context, builder) => {
    // builder is pre-configured: implement(contract).$context<TContext>()
  }
});

const { createClient } = await runtime.usePlugin("plugin-id", config);
const client = createClient();
const data = await client.getData({ id: "123" });
```

### Runtime Manages the Lifecycle

The runtime handles plugin loading ([Module Federation](https://module-federation.io/) or local imports), secret injection, initialization, and cleanup. Resources are managed automatically through [Effect](https://effect.website/):

```typescript
const runtime = createPluginRuntime({
  registry: { /* plugin definitions */ },
  secrets: { /* secret values */ }
});

const result = await runtime.usePlugin("plugin-id", config);

await runtime.shutdown();
```

### Multiple Access Patterns from One Interface

`usePlugin()` returns an `EveryPlugin` with three ways to work with plugins:

```typescript
const { createClient, router, metadata } = await runtime.usePlugin(...);

// 1. Client - Direct typed procedure calls
const client = createClient();
const data = await client.getData({ id: "123" });

// 2. Router - Mount as HTTP endpoints
const handler = new OpenAPIHandler(router);

// 3. Streaming - Process continuous data
const stream = await client.streamItems({ query: "typescript" });
for await (const item of stream) {
  console.log(item);
}
```

### Local and Remote Plugins, Same API

Two deployment patterns with identical APIs:

```typescript
// Production - Remote plugins via Module Federation
const runtime = createPluginRuntime({
  registry: {
    "plugin-id": {
      remoteUrl: "https://cdn.example.com/remoteEntry.js",
      version: "1.0.0"
    }
  }
});

// Development/Testing - Local plugins
const runtime = createLocalPluginRuntime(
  { registry: {...} },
  { "plugin-id": PluginImplementation }
);

const { createClient } = await runtime.usePlugin("plugin-id", config);
const client = createClient();
```

### Secret Management with Template Injection

Secrets are defined centrally and injected at runtime using template syntax:

```typescript
const runtime = createPluginRuntime({
  registry: { /* plugins */ },
  secrets: {
    API_KEY: process.env.API_KEY,
    DATABASE_URL: process.env.DATABASE_URL
  }
});

const { createClient } = await runtime.usePlugin("plugin-id", {
  secrets: {
    apiKey: "{{API_KEY}}",
    dbUrl: "{{DATABASE_URL}}"
  },
  variables: {
    timeout: 30000
  }
});

const client = createClient();
```

### Plugins Can Be Sophisticated

Plugins aren't limited to simple API wrappers. With Effect's resource management, they can:

**Run Background Tasks** - Continuously poll APIs, process queues, or generate events:

```typescript
initialize: (config) => Effect.gen(function* () {
  const queue = yield* Queue.bounded(1000);
  
  yield* Effect.forkScoped(
    Effect.gen(function* () {
      while (true) {
        const event = yield* fetchFromExternalAPI();
        yield* Queue.offer(queue, event);
        yield* Effect.sleep("1 second");
      }
    })
  );
  
  return { queue };
})
```

**Stream Data Continuously** - Process infinite streams with backpressure:

```typescript
streamEvents: handler(async function* () {
  while (true) {
    const event = await Effect.runPromise(Queue.take(context.queue));
    yield event;
  }
})
```

**Compose into Pipelines** - Chain plugins together for complex workflows:

```typescript
const { client: source } = await runtime.usePlugin("data-source", config);
const { client: processor } = await runtime.usePlugin("transformer", config);
const { client: distributor } = await runtime.usePlugin("webhook", config);

const rawData = await source.fetch({ query: "typescript" });
const transformed = await processor.transform({ items: rawData.items });
await distributor.send({ items: transformed.items });
```

**Mount as HTTP APIs** - Expose plugin procedures via OpenAPI or RPC:

```typescript
const { router } = await runtime.usePlugin("plugin-id", config);
const handler = new OpenAPIHandler(router);

server.use('/api', handler.handle);
```

This flexibility means plugins can be:

- **Simple API clients** for basic integrations
- **Background processors** for continuous data ingestion
- **Stream transformers** for real-time data pipelines
- **HTTP services** exposed via OpenAPI
- **Job workers** in queue systems like BullMQ

All with the same type-safe contract interface, and easy to use with simple async/await.

## Usage Examples

### Single Execution

Execute a plugin once with full type safety:

```typescript
import { createPluginRuntime } from "every-plugin/runtime";

const runtime = createPluginRuntime({
  registry: {
    "social-feed": {
      remoteUrl: "https://cdn.example.com/plugins/social/remoteEntry.js",
      version: "1.0.0"
    }
  },
  secrets: {
    SOCIAL_API_KEY: "your-api-key"
  }
});

const { createClient } = await runtime.usePlugin("social-feed", {
  secrets: { apiKey: "{{SOCIAL_API_KEY}}" },
  variables: { timeout: 30000 }
});

const client = createClient();
const posts = await client.search({ query: "typescript", limit: 10 });
console.log(`Found ${posts.items.length} posts`);

await runtime.shutdown();
```

### Streaming Data

For continuous data processing with async iterators:

```typescript
const { createClient } = await runtime.usePlugin("social-feed", {
  secrets: { apiKey: "{{SOCIAL_API_KEY}}" },
  variables: { timeout: 30000 }
});

const client = createClient();
const stream = await client.streamItems({ query: "typescript" });

for await (const item of stream) {
  console.log("Received item:", item);

  if (item.id === "target-id") break;
}
```

### Error Handling

Handle errors gracefully with try-catch:

```typescript
try {
  const { createClient } = await runtime.usePlugin("social-feed", config);
  const client = createClient();
  const result = await client.search({ query: "typescript" });
  console.log(result);
} catch (error) {
  console.error("Plugin failed:", error);
}
```

## Advanced Patterns

### Worker Integration

Perfect for BullMQ workers or similar job processing systems:

```typescript
import { Job } from "bullmq";
import { createPluginRuntime } from "every-plugin/runtime";

const runtime = createPluginRuntime({
  registry: pluginRegistry,
  secrets: await loadSecrets(),
});

const processJob = async (job: Job) => {
  const { pluginId, config, input } = job.data;

  const { createClient } = await runtime.usePlugin(pluginId, config);
  const client = createClient();
  return await client.process(input);
};

const worker = new Worker("my-queue", processJob);

process.on("SIGTERM", async () => {
  await worker.close();
  await runtime.shutdown();
});
```

### Plugin Pipeline Composition

Chain multiple plugins for complex workflows:

```typescript
const { createClient: createSourceClient } = await runtime.usePlugin("data-source", {
  secrets: { apiKey: "{{SOURCE_API_KEY}}" }
});
const source = createSourceClient();

const { createClient: createProcessorClient } = await runtime.usePlugin("transformer", {
  variables: { format: "json" }
});
const processor = createProcessorClient();

const { createClient: createDistributorClient } = await runtime.usePlugin("webhook", {
  secrets: { webhookUrl: "{{WEBHOOK_URL}}" }
});
const distributor = createDistributorClient();

const rawData = await source.fetch({ query: "typescript" });
const processed = await processor.transform({ items: rawData.items });
await distributor.send({ items: processed.items });
```

### Mounting Plugins as HTTP APIs

```typescript
import { createPluginRuntime } from "every-plugin/runtime";
import { OpenAPIHandler } from "orpc/openapi";
import express from "express";

const runtime = createPluginRuntime({
  registry: pluginRegistry,
  secrets: await loadSecrets()
});

const app = express();

const { router } = await runtime.usePlugin("data-api", config);
const handler = new OpenAPIHandler(router);

app.use('/api', handler.handle);
app.listen(3000);
```

## API Reference

### `createPluginRuntime(config)`

Creates a runtime for plugin execution.

**Parameters:**

- `config.registry`: Plugin registry mapping with remote URLs
- `config.secrets`: Secret values for template injection (optional)
- `config.logger`: Custom logger implementation (optional)

**Returns:** Runtime instance with `usePlugin()` and `shutdown()` methods

### `createLocalPluginRuntime(config, plugins)`

Creates a runtime with local plugin implementations for testing/development.

**Parameters:**

- `config`: Same as `createPluginRuntime`
- `plugins`: Map of plugin IDs to plugin implementations

**Returns:** Runtime instance with same API as `createPluginRuntime`

### `runtime.usePlugin(pluginId, config)`

Load, initialize, and return a plugin interface.

**Parameters:**

- `pluginId`: ID from the registry
- `config.secrets`: Secret templates to inject
- `config.variables`: Configuration variables

**Returns:** Promise resolving to `{ client, router, metadata }`

- `client`: Typed client for direct procedure calls
- `router`: oRPC router for HTTP mounting
- `metadata`: Plugin metadata

### `runtime.shutdown()`

Cleanup all plugins and release resources.

**Returns:** Promise that resolves when shutdown is complete

## Plugin Types

- **Source**: Fetch data from external APIs with oRPC contracts
- **Transformer**: Process and transform data between formats
- **Distributor**: Send data to external systems

All plugin types use the same oRPC contract interface for type safety.

## Development

```bash
# Install dependencies
bun install

# Build the package
bun run build

# Run tests
bun test
```

## License

MIT
