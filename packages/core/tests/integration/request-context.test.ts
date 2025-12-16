import { createServer } from "node:http";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCClient } from "@orpc/client";
import { ContractRouterClient } from "@orpc/contract";
import { RPCHandler } from "@orpc/server/node";
import { createPluginRuntime } from "every-plugin";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testContract } from "../fixtures/test-plugin/src";
import { TEST_REGISTRY } from "../registry";
import { PORT_POOL } from "../setup/global-setup";

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

describe("Request Context Integration", () => {
  const runtime = createPluginRuntime({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  let server: ReturnType<typeof createServer> | null = null;
  let plugin: any = null;
  let baseUrl: string = "";

  beforeAll(async () => {
    plugin = await runtime.usePlugin("test-plugin", TEST_CONFIG);
    const { router } = plugin;

    const rpcHandler = new RPCHandler(router);

    const port = PORT_POOL.REQUEST_CONTEXT_TEST;
    baseUrl = `http://localhost:${port}`;

    server = createServer(async (req, res) => {
      const url = new URL(req.url!, baseUrl);

      if (url.pathname.startsWith('/rpc')) {
        // Test different context scenarios
        let requestContext = {};

        if (req.headers['x-test-user']) {
          requestContext = {
            userId: req.headers['x-test-user'] as string,
            sessionId: req.headers['x-test-session'] as string,
          };
        }

        const result = await rpcHandler.handle(req, res, {
          prefix: '/rpc',
          context: requestContext // Request context from host
        });
        if (result.matched) return;
      }

      res.statusCode = 404;
      res.end('Route not found');
    });

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

  it("should pass request context from host to handler", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
      headers: {
        'x-test-user': 'user123',
        'x-test-session': 'session456',
      },
    });

    const client: ContractRouterClient<typeof testContract> = createORPCClient(link);

    const result = await client.ping({});

    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('timestamp');
  });

  it("should allow middleware to check authentication", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
      headers: {
        'x-test-user': 'user123',
        'x-test-session': 'session456',
      },
    });

    const client: ContractRouterClient<typeof testContract> = createORPCClient(link);

    // This should work because we have userId in context
    const result = await client.requiresSpecialConfig({ checkValue: "test" });

    expect(result).toHaveProperty('configValue');
    expect(result).toHaveProperty('inputValue', 'test');
    expect(result).toHaveProperty('userId', 'user123');
  });

  it("should reject protected routes without userId", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
      // No x-test-user header - should fail
    });

    const client: ContractRouterClient<typeof testContract> = createORPCClient(link);

    await expect(
      client.requiresSpecialConfig({ checkValue: "test" })
    ).rejects.toThrow('User ID required');
  });

  it("should allow public routes without context", { timeout: 10000 }, async () => {
    const link = new RPCLink({
      url: `${baseUrl}/rpc`,
      fetch: globalThis.fetch,
      // No headers - empty context
    });

    const client: ContractRouterClient<typeof testContract> = createORPCClient(link);

    const result = await client.ping({});

    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('timestamp');
  });
});
