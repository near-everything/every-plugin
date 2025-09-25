import { expect, it } from "@effect/vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { AnyContractRouter } from "@orpc/contract";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Effect, Stream } from "effect";
import { createServer } from "node:http";
import { describe, beforeAll,afterAll } from "vitest";
import { createPluginClient, getPluginRouter } from "../../src/client/index";
import type { PluginBinding } from "../../src/plugin";
import { createTestPluginRuntime, type TestPluginMap } from "../../src/testing";
import type { PluginRegistry } from "../../src/types";
import { PORT_POOL } from "../integration/global-setup";
import type { TestPluginClient } from "../test-plugin/src/index";
import TestPlugin from "../test-plugin/src/index";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "0.0.1",
  },
};

const TEST_CONFIG = {
  variables: {
    baseUrl: "http://localhost:1337",
    timeout: 5000,
  },
  secrets: {
    apiKey: "test-api-key-value",
  },
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

const TEST_PLUGIN_MAP: TestPluginMap = {
  "test-plugin": TestPlugin,
};

describe("Plugin Router Access Methods", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  }, TEST_PLUGIN_MAP);

  // Shared server setup for all tests
  let server: ReturnType<typeof createServer> | null = null;
  let plugin: any = null;
  let baseUrl: string = "";

  beforeAll(async () => {
    const pluginRuntime = await Effect.runPromise(
      Effect.gen(function* () {
        const runtime = yield* PluginRuntime;
        return yield* runtime.usePlugin("test-plugin", TEST_CONFIG);
      }).pipe(Effect.provide(runtime))
    );
    
    plugin = pluginRuntime;
    const router = getPluginRouter(plugin);

    // Create both handlers
    const rpcHandler = new RPCHandler(router);
    const openApiHandler = new OpenAPIHandler(router);

    const port = PORT_POOL.RPC_TEST; // Use one port for unified server
    baseUrl = `http://localhost:${port}`;

    // Create unified server with both handlers
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, baseUrl);
      
      // Route to RPC handler
      if (url.pathname.startsWith('/rpc')) {
        const result = await rpcHandler.handle(req, res, {
          prefix: '/rpc',
          context: plugin.context
        });
        if (result.matched) return;
      }
      
      // Route to OpenAPI handler  
      if (url.pathname.startsWith('/api')) {
        const result = await openApiHandler.handle(req, res, {
          prefix: '/api',
          context: plugin.context
        });
        if (result.matched) return;
      }
      
      // 404 for unmatched routes
      res.statusCode = 404;
      res.end('Route not found');
    });

    // Start server
    await new Promise<void>((resolve, reject) => {
      server?.listen(port, '127.0.0.1', () => resolve());
      server?.on('error', reject);
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
    }
  });

  it.effect("should work via direct client calls", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      // Test direct client access (existing pattern)
      const client = createPluginClient(plugin);

      // Test basic procedure
      const getByIdResult = yield* Effect.tryPromise(() =>
        client.getById({ id: "direct-test-123" })
      );

      expect(getByIdResult).toHaveProperty('item');
      expect(getByIdResult.item).toHaveProperty('externalId', 'direct-test-123');
      expect(getByIdResult.item.content).toContain('single content for direct-test-123');

      // Test bulk operation
      const getBulkResult = yield* Effect.tryPromise(() =>
        client.getBulk({ ids: ["direct-bulk1", "direct-bulk2"] })
      );

      expect(getBulkResult).toHaveProperty('items');
      expect(getBulkResult.items).toHaveLength(2);
      expect(getBulkResult.items[0].externalId).toBe('direct-bulk1');
      expect(getBulkResult.items[1].externalId).toBe('direct-bulk2');

    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should work via OpenAPI HTTP", () =>
    Effect.gen(function* () {
      // Test basic HTTP request - getById
      const getByIdResponse = yield* Effect.tryPromise(() =>
        fetch(`${baseUrl}/api/getById`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: "http-test-123" })
        })
      );

      const getByIdResult = yield* Effect.tryPromise(() => getByIdResponse.json());

      expect(getByIdResult).toHaveProperty('item');
      expect(getByIdResult.item).toHaveProperty('externalId', 'http-test-123');
      expect(getByIdResult.item.content).toContain('single content for http-test-123');

      // Test bulk operation via HTTP
      const getBulkResponse = yield* Effect.tryPromise(() =>
        fetch(`${baseUrl}/api/getBulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ["http-bulk1", "http-bulk2"] })
        })
      );

      const getBulkResult = yield* Effect.tryPromise(() => getBulkResponse.json());

      expect(getBulkResult).toHaveProperty('items');
      expect(getBulkResult.items).toHaveLength(2);
      expect(getBulkResult.items[0].externalId).toBe('http-bulk1');
      expect(getBulkResult.items[1].externalId).toBe('http-bulk2');

    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should work via oRPC client", () =>
    Effect.gen(function* () {
      // Create oRPC client using shared server
      const link = new RPCLink({
        url: `${baseUrl}/rpc`,
        fetch: globalThis.fetch,
      });

      const client: TestPluginClient = createORPCClient(link);

      // Test basic oRPC call - getById
      const getByIdResult = yield* Effect.tryPromise(() =>
        client.getById({ id: "orpc-test-123" })
      );

      expect(getByIdResult).toHaveProperty('item');
      expect(getByIdResult.item).toHaveProperty('externalId', 'orpc-test-123');
      expect(getByIdResult.item.content).toContain('single content for orpc-test-123');

      // Test bulk operation via oRPC
      const getBulkResult = yield* Effect.tryPromise(() =>
        client.getBulk({ ids: ["orpc-bulk1", "orpc-bulk2"] })
      );

      expect(getBulkResult).toHaveProperty('items');
      expect(getBulkResult.items).toHaveLength(2);
      expect(getBulkResult.items[0].externalId).toBe('orpc-bulk1');
      expect(getBulkResult.items[1].externalId).toBe('orpc-bulk2');

    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should handle streaming via oRPC", () =>
    Effect.gen(function* () {
      // Create oRPC client using shared server
      const link = new RPCLink({
        url: `${baseUrl}/rpc`,
        fetch: globalThis.fetch,
      });

      const client: TestPluginClient = createORPCClient(link);

      // Test streaming via oRPC client - this is the key feature we want to verify
      const streamResult = yield* Effect.tryPromise(() =>
        client.simpleStream({ count: 3, prefix: "orpc-stream" })
      );

      // Convert to Effect stream and collect
      const stream = Stream.fromAsyncIterable(streamResult, (error) => error);
      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const resultArray = Array.from(items);
      expect(resultArray.length).toBe(3);
      expect(resultArray[0]).toHaveProperty('item');
      expect(resultArray[0].item.externalId).toBe('orpc-stream_0');
      expect(resultArray[1].item.externalId).toBe('orpc-stream_1');
      expect(resultArray[2].item.externalId).toBe('orpc-stream_2');

      // Test empty stream
      const emptyStreamResult = yield* Effect.tryPromise(() =>
        client.emptyStream({ reason: "testing empty stream via oRPC" })
      );

      const emptyStream = Stream.fromAsyncIterable(emptyStreamResult, (error) => error);
      const emptyItems = yield* emptyStream.pipe(
        Stream.runCollect
      );

      const emptyArray = Array.from(emptyItems);
      expect(emptyArray.length).toBe(0);

    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should generate OpenAPI specification from plugin router", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const router = getPluginRouter(plugin);

      // Create OpenAPI generator
      const generator = new OpenAPIGenerator({
        schemaConverters: [
          new ZodToJsonSchemaConverter()
        ]
      });

      // Generate OpenAPI spec - verify the router is compatible
      const spec = yield* Effect.tryPromise(() =>
        generator.generate(router, {
          info: {
            title: 'Test Plugin API',
            version: '1.0.0',
            description: 'Generated OpenAPI spec for test plugin'
          }
        })
      );

      // Verify spec structure
      expect(spec).toHaveProperty('openapi');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');

      expect(spec.info.title).toBe('Test Plugin API');
      expect(spec.info.version).toBe('1.0.0');

      // Verify paths exist for our procedures
      expect(spec.paths).toBeDefined();
      if (spec.paths) {
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
      }

    }).pipe(Effect.provide(runtime), Effect.timeout("5 seconds"))
  );
});
