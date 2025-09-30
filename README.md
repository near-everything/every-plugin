<!-- markdownlint-disable MD014 -->
<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<!-- markdownlint-disable MD029 -->

<div align="center">

<img src="https://plugin.everything.dev/metadata.jpg" alt="every-plugin banner" width="100%" />

</div>

<br/>

A modular plugin runtime & system built with [Effect.TS](https://effect.website/) for loading, initializing, and executing remote plugins via [Module Federation](https://module-federation.io/).

[![npm bundle size](https://img.shields.io/bundlephobia/minzip/every-plugin@latest)](https://bundlephobia.com/result?p=every-plugin@latest)

## Installation

```bash
bun add every-plugin
```

## Quick Start

Create a runtime and execute your first plugin:

```typescript
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import { Effect } from "effect";

const runtime = createPluginRuntime({
  registry: {
    "data-processor": {
      remoteUrl: "https://cdn.example.com/plugins/processor/remoteEntry.js",
      type: "transformer",
      version: "1.0.0"
    }
  },
  secrets: {
    API_KEY: "your-secret-key"
  }
});

const result = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    const plugin = yield* pluginRuntime.usePlugin("data-processor", {
      secrets: { apiKey: "{{API_KEY}}" },
      variables: { timeout: 30000 }
    });
    
    return yield* pluginRuntime.executePlugin(plugin, {
      items: ["data1", "data2", "data3"]
    });
  })
);

console.log(result);
await runtime.disposeRuntime();
```

## Core Concepts

### Plugin Runtime

The runtime manages plugin loading and execution. Create one instance per application:

```typescript
const runtime = createPluginRuntime({
  registry: { /* plugin definitions */ },
  secrets: { /* secret values */ }
});
```

### Plugin Registry

Plugins are defined in a registry with their remote URLs:

```typescript
const registry = {
  "my-plugin": {
    remoteUrl: "https://cdn.example.com/plugins/my-plugin/remoteEntry.js",
    type: "source", // or "transformer", "distributor"
    version: "1.0.0"
  }
};
```

Plugins are loaded dynamically using [Module Federation](https://module-federation.io/).

### Secret Hydration

Secrets use template syntax and are replaced at runtime:

```typescript
const config = {
  secrets: {
    apiKey: "{{API_KEY}}", // Replaced with actual secret
    dbUrl: "{{DATABASE_URL}}"
  },
  variables: {
    timeout: 30000 // Regular values pass through
  }
};
```

### Plugin Types

- **Source**: Fetch data from external APIs with oRPC contracts
- **Transformer**: Process and transform data between formats  
- **Distributor**: Send data to external systems

## Usage Examples

### Single Execution

Execute a plugin once with oRPC contract format:

```typescript
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import { Effect } from "effect";

const runtime = createPluginRuntime({
  registry: {
    "social-feed": {
      remoteUrl: "https://cdn.example.com/plugins/social/remoteEntry.js",
      type: "source",
      version: "1.0.0"
    }
  },
  secrets: {
    SOCIAL_API_KEY: "your-api-key"
  }
});

const posts = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    const plugin = yield* pluginRuntime.usePlugin("social-feed", {
      secrets: { apiKey: "{{SOCIAL_API_KEY}}" },
      variables: { timeout: 30000 }
    });
    
    return yield* pluginRuntime.executePlugin(plugin, {
      procedure: "search",
      input: { query: "typescript", limit: 10 },
      state: null
    });
  })
);

console.log(`Found ${posts.items.length} posts`);
await runtime.disposeRuntime();
```

### Streaming Data

For continuous data processing:

```typescript
import { Stream } from "effect";

const stream = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    return yield* pluginRuntime.streamPlugin(
      "social-feed",
      {
        secrets: { apiKey: "{{SOCIAL_API_KEY}}" },
        variables: { timeout: 30000 }
      },
      {
        procedure: "search", 
        input: { query: "typescript" },
        state: null
      },
      { maxItems: 100 }
    );
  })
);

// Process stream
const items = await runtime.runPromise(
  stream.pipe(Stream.take(50), Stream.runCollect)
);

console.log(`Streamed ${items.length} items`);
```

### Error Handling

All operations return Effect types with composable error handling:

```typescript
const safeResult = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    return yield* pluginRuntime.usePlugin("social-feed", config);
  }).pipe(
    Effect.catchAll((error) => {
      console.error("Plugin failed:", error);
      return Effect.succeed(null);
    })
  )
);
```

## Advanced Patterns

### Worker Integration

Perfect for BullMQ workers or similar job processing systems:

```typescript
import { Job } from "bullmq";
import { Effect } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Initialize runtime once per worker
const runtime = createPluginRuntime({
  registry: pluginRegistry,
  secrets: await loadSecrets(),
});

// Job processor
const processJob = (job: Job) => 
  runtime.runPromise(
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const { pluginId, config, input } = job.data;
      
      const plugin = yield* pluginRuntime.usePlugin(pluginId, config);
      return yield* pluginRuntime.executePlugin(plugin, input);
    })
  );

// Worker setup
const worker = new Worker("my-queue", processJob);

// Cleanup on shutdown
process.on("SIGTERM", async () => {
  await worker.close();
  await runtime.disposeRuntime();
});
```

### Granular Control

For step-by-step plugin lifecycle management:

```typescript
const processWithGranularControl = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;
  
  // Step-by-step plugin lifecycle
  const constructor = yield* pluginRuntime.loadPlugin("@my-org/data-processor");
  const instance = yield* pluginRuntime.instantiatePlugin(constructor);
  const initialized = yield* pluginRuntime.initializePlugin(instance, config);
  const output = yield* pluginRuntime.executePlugin(initialized, input);
  
  return output;
});

await runtime.runPromise(processWithGranularControl);
```

### React/Next.js Integration

```typescript
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import { Effect } from "effect";

// Create runtime at app level
const pluginRuntime = createPluginRuntime({
  registry: clientSideRegistry,
  secrets: {} // No secrets on client side
});

// In a React component or API route
export async function executePlugin(pluginId: string, config: any, input: any) {
  return pluginRuntime.runPromise(
    Effect.gen(function* () {
      const runtime = yield* PluginRuntime;
      const plugin = yield* runtime.usePlugin(pluginId, config);
      return yield* runtime.executePlugin(plugin, input);
    })
  );
}

// Cleanup in app teardown
export function cleanup() {
  return pluginRuntime.dispose();
}
```

## API Reference

### `createPluginRuntime(config)`

Creates a managed runtime for plugin execution.

**Parameters:**

- `config.registry`: Plugin registry mapping
- `config.secrets`: Secret values for hydration (optional)
- `config.logger`: Custom logger implementation (optional)

**Returns:** `ManagedRuntime` instance

### `PluginRuntime`

Effect service tag for accessing the plugin runtime within Effect workflows.

### Plugin Runtime Methods

- `loadPlugin(pluginId)`: Load plugin constructor from registry
- `instantiatePlugin(constructor)`: Create plugin instance
- `initializePlugin(instance, config)`: Initialize with config and secrets
- `executePlugin(plugin, input)`: Execute plugin with input
- `usePlugin(pluginId, config)`: Load + instantiate + initialize in one step
- `streamPlugin(pluginId, config, input, options)`: Stream plugin execution

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
