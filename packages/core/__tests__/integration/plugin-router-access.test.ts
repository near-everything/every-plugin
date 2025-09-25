import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { createServer } from "node:http";
import { describe } from "vitest";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { RPCHandler } from "@orpc/server/node";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createPluginClient, getPluginRouter } from "../../src/client/index";
import type { PluginBinding } from "../../src/plugin";
import { createPluginRuntime } from "../../src/runtime";
import type TestPlugin from "../test-plugin/src/index";
import { TEST_REMOTE_ENTRY_URL, PORT_POOL } from "./global-setup";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry using the real served plugin from global setup
const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    type: "source",
    version: "0.0.1",
  },
} as const;

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

describe("Plugin Router Access Methods", () => {
  const { runtime, PluginRuntime } = createPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
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
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      // Get the plugin router
      const router = getPluginRouter(plugin);

      // Create OpenAPI handler
      const handler = new OpenAPIHandler(router);

      // Use dedicated port for OpenAPI test
      const port = PORT_POOL.OPENAPI_TEST;
      const baseUrl = `http://localhost:${port}`;

      let server: ReturnType<typeof createServer> | null = null;

      try {
        // Create and start HTTP server
        server = createServer(async (req, res) => {
          const result = await handler.handle(req, res, {
            context: plugin.context
          });

          if (!result.matched) {
            res.statusCode = 404;
            res.end('No procedure matched');
          }
        });

        // Start server
        yield* Effect.tryPromise(() => new Promise<void>((resolve, reject) => {
          server!.listen(port, '127.0.0.1', () => resolve());
          server!.on('error', reject);
        }));

        // Test basic HTTP request - getById
        const getByIdResponse = yield* Effect.tryPromise(() =>
          fetch(`${baseUrl}/getById`, {
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
          fetch(`${baseUrl}/getBulk`, {
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

      } finally {
        // Clean up server
        if (server) {
          yield* Effect.tryPromise(() => new Promise<void>((resolve) => {
            server!.close(() => resolve());
          }));
        }
      }
    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should work via oRPC client", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      // Get the plugin router
      const router = getPluginRouter(plugin);

      // Create RPC handler
      const handler = new RPCHandler(router);

      // Find available port and create server
      const port = PORT_POOL.RPC_TEST;
      const baseUrl = `http://localhost:${port}`;

      let server: ReturnType<typeof createServer> | null = null;

      try {
        // Create and start HTTP server
        server = createServer(async (req, res) => {
          const result = await handler.handle(req, res, {
            context: plugin.context
          });

          if (!result.matched) {
            res.statusCode = 404;
            res.end('No procedure matched');
          }
        });

        // Start server
        yield* Effect.tryPromise(() => new Promise<void>((resolve, reject) => {
          server!.listen(port, '127.0.0.1', () => resolve());
          server!.on('error', reject);
        }));

        // Create oRPC client
        const link = new RPCLink({
          url: `${baseUrl}/rpc`,
          fetch: globalThis.fetch,
        });

        const client = createORPCClient(link);

        // Test basic oRPC call - getById
        const getByIdResult = yield* Effect.tryPromise(() =>
          (client).getById({ id: "orpc-test-123" })
        );

        expect(getByIdResult).toHaveProperty('item');
        expect(getByIdResult.item).toHaveProperty('externalId', 'orpc-test-123');
        expect(getByIdResult.item.content).toContain('single content for orpc-test-123');

        // Test bulk operation via oRPC
        const getBulkResult = yield* Effect.tryPromise(() =>
          (client).getBulk({ ids: ["orpc-bulk1", "orpc-bulk2"] })
        );

        expect(getBulkResult).toHaveProperty('items');
        expect(getBulkResult.items).toHaveLength(2);
        expect(getBulkResult.items[0].externalId).toBe('orpc-bulk1');
        expect(getBulkResult.items[1].externalId).toBe('orpc-bulk2');

      } finally {
        // Clean up server
        if (server) {
          yield* Effect.tryPromise(() => new Promise<void>((resolve) => {
            server!.close(() => resolve());
          }));
        }
      }
    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should handle streaming via oRPC", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const router = getPluginRouter(plugin);
      const handler = new RPCHandler(router);

      const port = PORT_POOL.STREAMING_TEST;
      const baseUrl = `http://localhost:${port}`;

      let server: ReturnType<typeof createServer> | null = null;

      try {
        server = createServer(async (req, res) => {
          const result = await handler.handle(req, res, {
            context: plugin.context
          });

          if (!result.matched) {
            res.statusCode = 404;
            res.end('No procedure matched');
          }
        });

        yield* Effect.tryPromise(() => new Promise<void>((resolve, reject) => {
          server!.listen(port, '127.0.0.1', () => resolve());
          server!.on('error', reject);
        }));

        const link = new RPCLink({
          url: `${baseUrl}/rpc`,
          fetch: globalThis.fetch,
        });

        const client = createORPCClient(link);

        // Test streaming via oRPC client - this is the key feature we want to verify
        const streamResult = yield* Effect.tryPromise(() =>
          (client).simpleStream({ count: 3, prefix: "orpc-stream" })
        );

        // Convert to Effect stream and collect
        const stream = Stream.fromAsyncIterable(streamResult as AsyncIterable<any>, (error) => error);
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
          (client).emptyStream({ reason: "testing empty stream via oRPC" })
        );

        const emptyStream = Stream.fromAsyncIterable(emptyStreamResult as AsyncIterable<any>, (error) => error);
        const emptyItems = yield* emptyStream.pipe(
          Stream.runCollect
        );

        const emptyArray = Array.from(emptyItems);
        expect(emptyArray.length).toBe(0);

      } finally {
        if (server) {
          yield* Effect.tryPromise(() => new Promise<void>((resolve) => {
            server!.close(() => resolve());
          }));
        }
      }
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
      expect(spec).toHaveProperty('components');

      expect(spec.info.title).toBe('Test Plugin API');
      expect(spec.info.version).toBe('1.0.0');

      // Verify paths exist for our procedures
      expect(spec.paths).toBeDefined();
      if (spec.paths) {
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
      }

      // Verify components/schemas exist (from Zod schemas)
      expect(spec.components).toHaveProperty('schemas');
      if (spec.components?.schemas) {
        expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
      }

    }).pipe(Effect.provide(runtime), Effect.timeout("5 seconds"))
  );
});
