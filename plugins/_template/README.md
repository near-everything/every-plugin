# Template Plugin

A minimal, well-documented template for building every-plugin plugins. Use this as a starting point for integrating external APIs, libraries, or services.

## What's Included

```bash
src/
├── contract.ts    # oRPC contract (3 procedures: getById, search, ping)
├── service.ts     # Plain TypeScript class with Effect error handling
├── index.ts       # Plugin implementation with createPlugin
└── LLM.txt        # Comprehensive guide for building plugins
```

## Quick Start

> **📖 For a comprehensive guide with code examples and patterns, see [LLM.txt](./LLM.txt)**

1. **Copy the template:**

   ```bash
   npx degit near-everything/every-plugin/plugins/template my-plugin
   cd my-plugin
   ```

2. **Update `contract.ts`:**
   - Define your API procedures
   - Create Zod schemas for inputs/outputs

3. **Update `service.ts`:**
   - Replace constructor params with your config needs
   - Implement methods to call your external API
   - Use `Effect.tryPromise` for error handling

4. **Update `index.ts`:**
   - Change plugin `id` to `@your-org/your-plugin`
   - Update `variables` and `secrets` schemas
   - Pass config to service constructor

5. **Test locally:**

   ```typescript
   import { createLocalPluginRuntime } from "every-plugin/runtime";
   import YourPlugin from "./src/index";

   const runtime = createLocalPluginRuntime(
     { registry: {} },
     { "your-plugin": YourPlugin }
   );

   const { client } = await runtime.usePlugin("your-plugin", {
     variables: { baseUrl: "https://api.example.com", timeout: 10000 },
     secrets: { apiKey: "your-key" }
   });

   const result = await client.getById({ id: "123" });
   ```

## Documentation

**👉 Read [LLM.txt](./LLM.txt) for the complete guide** - it includes:

- Step-by-step plugin building tutorial
- Advanced patterns (background processing, webhooks, pagination)
- Error handling with CommonPluginErrors
- Copy-paste code templates
- Best practices and common pitfalls
- Full working examples

The LLM.txt file is designed to be used with AI coding assistants to help you build plugins quickly.

## Example: The Template in Action

```typescript
// After building and deploying
const runtime = createPluginRuntime({
  registry: {
    "template": {
      remoteUrl: "https://cdn.example.com/template/remoteEntry.js",
      version: "1.0.0"
    }
  },
  secrets: { API_KEY: process.env.API_KEY }
});

const { client } = await runtime.usePlugin("template", {
  variables: { 
    baseUrl: "https://api.example.com",
    timeout: 5000 
  },
  secrets: { apiKey: "{{API_KEY}}" }
});

// Single fetch
const item = await client.getById({ id: "item-123" });
console.log(item.title);

// Streaming
const stream = await client.search({ query: "typescript", limit: 10 });
for await (const result of stream) {
  console.log(`${result.score}: ${result.item.title}`);
}

// Health check
const ping = await client.ping();
console.log(ping.status); // "ok"
```

## Related Examples

- **[test-plugin](../../packages/core/__tests__/test-plugin/)** - Testing patterns

## License

Part of the [every-plugin](https://github.com/near-everything/every-plugin) framework.
