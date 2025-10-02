import { expect, it } from "@effect/vitest";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Effect, Stream } from "effect";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe } from "vitest";
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
  const runtime = createTestPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  }, TEST_PLUGIN_MAP);

  // Shared server setup for all tests
  let server: ReturnType<typeof createServer> | null = null;
  let plugin: any = null;
  let baseUrl: string = "";

  beforeAll(async () => {
    const pluginResult = await runtime.usePlugin("test-plugin", TEST_CONFIG);

    plugin = pluginResult;
    const router = pluginResult.router;

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
          context: plugin.initialized.context
        });
        if (result.matched) return;
      }

      // Route to OpenAPI handler  
      if (url.pathname.startsWith('/api')) {
        const result = await openApiHandler.handle(req, res, {
          prefix: '/api',
          context: plugin.initialized.context
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

  it("should work via direct client calls", { timeout: 10000 }, async () => {
    const result = await runtime.usePlugin("test-plugin", TEST_CONFIG);

    const { client } = result;

    const getByIdResult = await client.getById({ id: "direct-test-123" });

    expect(getByIdResult).toHaveProperty('item');
    expect(getByIdResult.item).toHaveProperty('externalId', 'direct-test-123');
    expect(getByIdResult.item.content).toContain('single content for direct-test-123');

    const getBulkResult = await client.getBulk({ ids: ["direct-bulk1", "direct-bulk2"] });

    expect(getBulkResult).toHaveProperty('items');
    expect(getBulkResult.items).toHaveLength(2);
    expect(getBulkResult.items[0].externalId).toBe('direct-bulk1');
    expect(getBulkResult.items[1].externalId).toBe('direct-bulk2');
  });

  it("should work via OpenAPI HTTP", { timeout: 10000 }, async () => {
    const getByIdResponse = await fetch(`${baseUrl}/api/getById`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: "http-test-123" })
    });

    const getByIdResult = await getByIdResponse.json();

    expect(getByIdResult).toHaveProperty('item');
    expect(getByIdResult.item).toHaveProperty('externalId', 'http-test-123');
    expect(getByIdResult.item.content).toContain('single content for http-test-123');

    const getBulkResponse = await fetch(`${baseUrl}/api/getBulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ["http-bulk1", "http-bulk2"] })
    });

    const getBulkResult = await getBulkResponse.json();

    expect(getBulkResult).toHaveProperty('items');
    expect(getBulkResult.items).toHaveLength(2);
    expect(getBulkResult.items[0].externalId).toBe('http-bulk1');
    expect(getBulkResult.items[1].externalId).toBe('http-bulk2');
  });

  it("should work via oRPC client", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
    });

    const client: TestPluginClient = createORPCClient(link);

    const getByIdResult = await client.getById({ id: "orpc-test-123" });

    expect(getByIdResult).toHaveProperty('item');
    expect(getByIdResult.item).toHaveProperty('externalId', 'orpc-test-123');
    expect(getByIdResult.item.content).toContain('single content for orpc-test-123');

    const getBulkResult = await client.getBulk({ ids: ["orpc-bulk1", "orpc-bulk2"] });

    expect(getBulkResult).toHaveProperty('items');
    expect(getBulkResult.items).toHaveLength(2);
    expect(getBulkResult.items[0].externalId).toBe('orpc-bulk1');
    expect(getBulkResult.items[1].externalId).toBe('orpc-bulk2');
  });

  it("should handle streaming via oRPC", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
    });

    const client: TestPluginClient = createORPCClient(link);

    const streamResult = await client.simpleStream({ count: 3, prefix: "orpc-stream" });

    const resultArray = [];
    for await (const item of streamResult) {
      resultArray.push(item);
    }

    expect(resultArray.length).toBe(3);
    expect(resultArray[0]).toHaveProperty('item');
    expect(resultArray[0].item.externalId).toBe('orpc-stream_0');
    expect(resultArray[1].item.externalId).toBe('orpc-stream_1');
    expect(resultArray[2].item.externalId).toBe('orpc-stream_2');

    const emptyStreamResult = await client.emptyStream({ reason: "testing empty stream via oRPC" });

    const emptyArray = [];
    for await (const item of emptyStreamResult) {
      emptyArray.push(item);
    }

    expect(emptyArray.length).toBe(0);
  });

  it("should generate OpenAPI specification from plugin router", { timeout: 5000 }, async () => {
    const result = await runtime.usePlugin("test-plugin", TEST_CONFIG);

    const { router } = result;

    const generator = new OpenAPIGenerator({
      schemaConverters: [
        new ZodToJsonSchemaConverter()
      ]
    });

    const spec = await generator.generate(router, {
      info: {
        title: 'Test Plugin API',
        version: '1.0.0',
        description: 'Generated OpenAPI spec for test plugin'
      }
    });

    expect(spec).toHaveProperty('openapi');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('paths');

    expect(spec.info.title).toBe('Test Plugin API');
    expect(spec.info.version).toBe('1.0.0');

    expect(spec.paths).toBeDefined();
    if (spec.paths) {
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    }
  });
});
