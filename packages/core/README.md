# every-plugin

A modular plugin runtime & system built with [Effect.TS](https://effect.website/) for loading, initializing, and executing remote plugins via [Module Federation](https://module-federation.io/).

## Installation

```bash
npm install every-plugin
# or
bun add every-plugin
```

## Quick Start

### Basic Plugin Usage

```typescript
import { Effect } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Create a managed runtime (do this once per application/worker)
const runtime = createPluginRuntime({
  registry: {
    "@my-org/data-processor": {
      version: "1.0.0",
      remoteUrl: "https://cdn.example.com/plugins/data-processor@latest/remoteEntry.js",
      description: "Processes data items",
      type: "pipeline"
    }
  },
  secrets: {
    API_KEY: "your-secret-key",
    DATABASE_URL: "postgresql://..."
  },
  logger: customLogger // optional
});

// Use the runtime to execute plugins
const result = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    // Load, instantiate and initialize a plugin
    const plugin = yield* pluginRuntime.usePlugin("@my-org/data-processor", {
      apiKey: "{{API_KEY}}", // Will be hydrated from secrets
      batchSize: 100
    });
    
    const output = yield* pluginRuntime.executePlugin(plugin, {
      items: ["item1", "item2", "item3"]
    });
    
    return output;
  })
);

console.log(result);

// Clean up when done
await runtime.dispose();
```

### Alternative: Direct Layer Construction

If you prefer more explicit control over the runtime construction:

```typescript
import { Effect, ManagedRuntime } from "effect";
import { PluginRuntime } from "every-plugin/runtime";

// This is equivalent to createPluginRuntime(config)
const runtime = ManagedRuntime.make(PluginRuntime.Live({
  registry: { /* ... */ },
  secrets: { /* ... */ }
}));

const result = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    const plugin = yield* pluginRuntime.usePlugin(pluginId, config);
    return yield* pluginRuntime.executePlugin(plugin, input);
  })
);
```

### Advanced Usage - Granular Control

```typescript
import { Effect } from "effect";
import { PluginRuntime } from "every-plugin/runtime";

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
  await runtime.dispose();
});
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

## Core Concepts

### Plugin Registry

The registry defines available plugins and their remote locations:

```typescript
type PluginRegistry = {
  [pluginId: string]: {
    version: string;
    remoteUrl: string;
    description?: string;
    type?: string;
  };
};
```

### Secret Hydration

Secrets are automatically hydrated using Mustache-style templating:

```typescript
const config = {
  apiKey: "{{API_KEY}}", // Will be replaced with actual secret
  endpoint: "https://api.example.com"
};
```

### Plugin Lifecycle

1. **Load**: Download and cache the remote plugin module
2. **Instantiate**: Create a new instance of the plugin class
3. **Initialize**: Configure the plugin with validated config and secrets
4. **Execute**: Run the plugin with validated input, return validated output

### Error Handling

All operations return Effect types with proper error handling:

```typescript
const result = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    return yield* pluginRuntime.usePlugin(pluginId, config);
  }).pipe(
    Effect.catchAll((error) => {
      console.error("Plugin execution failed:", error);
      return Effect.succeed(null); // Fallback value
    })
  )
);
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
- `usePlugin(pluginId, config)`: Load + instantiate + initialize in one step (does not execute)

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
