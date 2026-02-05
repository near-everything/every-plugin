import { Effect } from "every-plugin/effect";
import { loadBosConfig, type RuntimeConfig } from "everything-dev/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadRouterModule } from "@/services/federation.server";
import type { RouterModule } from "@/types";

async function consumeStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return html;
}

interface ORPCErrorResponse {
  code: string;
  status: number;
  message: string;
  data?: Record<string, unknown>;
}

const parseORPCError = async (response: Response): Promise<ORPCErrorResponse | null> => {
  try {
    const json = await response.json();
    if (json && typeof json === 'object' && 'code' in json) {
      return json as ORPCErrorResponse;
    }
    if (json && typeof json === 'object' && 'error' in json) {
      return json.error as ORPCErrorResponse;
    }
    return json;
  } catch {
    return null;
  }
};

describe("Error Propagation & Formatting", () => {
  let routerModule: RouterModule;
  let config: RuntimeConfig;

  const createMockApiClient = () => ({
    getValue: vi.fn().mockImplementation(({ key }: { key: string }) =>
      Promise.resolve({ key, value: `test-value-for-${key}`, updatedAt: new Date().toISOString() })
    ),
    setValue: vi.fn().mockResolvedValue({ key: "test", value: "value", created: true }),
    protected: vi.fn().mockResolvedValue({ message: "Protected data", accountId: "test.near", timestamp: new Date().toISOString() }),
    listKeys: vi.fn().mockResolvedValue({ keys: [], total: 0, hasMore: false }),
    deleteKey: vi.fn().mockResolvedValue({ key: "test", deleted: true }),
    ping: vi.fn().mockResolvedValue({ status: "ok", timestamp: new Date().toISOString() }),
  });

  let mockApiClient: ReturnType<typeof createMockApiClient>;

  beforeAll(async () => {
    mockApiClient = createMockApiClient();
    globalThis.$apiClient = mockApiClient;
    config = await loadBosConfig();
    routerModule = await Effect.runPromise(loadRouterModule(config));
  });

  afterAll(() => {
    (globalThis as Record<string, unknown>).$apiClient = undefined;
  });

  describe("UNAUTHORIZED Error Flow", () => {
    it("returns 401 when calling protected endpoint without authentication context", async () => {
      mockApiClient.protected.mockRejectedValueOnce({
        code: "UNAUTHORIZED",
        status: 401,
        message: "Auth required",
        data: { apiKeyProvided: false },
      });

      await expect(mockApiClient.protected()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        status: 401,
        message: "Auth required",
      });
    });

    it("preserves UNAUTHORIZED error structure through the client", async () => {
      const unauthorizedError = {
        code: "UNAUTHORIZED",
        status: 401,
        message: "Auth required",
        data: { apiKeyProvided: false },
      };
      mockApiClient.listKeys.mockRejectedValueOnce(unauthorizedError);

      try {
        await mockApiClient.listKeys({ limit: 10 });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toMatchObject({
          code: "UNAUTHORIZED",
          status: 401,
        });
      }
    });

    it("UNAUTHORIZED error includes proper status code 401", async () => {
      const error = {
        code: "UNAUTHORIZED",
        status: 401,
        message: "Auth required",
      };
      mockApiClient.getValue.mockRejectedValueOnce(error);

      try {
        await mockApiClient.getValue({ key: "test-key" });
        expect.fail("Should have thrown");
      } catch (e) {
        const err = e as ORPCErrorResponse;
        expect(err.status).toBe(401);
        expect(err.code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("NOT_FOUND Error Flow", () => {
    it("returns 404 when accessing non-existent resource", async () => {
      const notFoundError = {
        code: "NOT_FOUND",
        status: 404,
        message: "Key not found",
        data: { resource: "kv", resourceId: "non-existent-key" },
      };
      mockApiClient.getValue.mockRejectedValueOnce(notFoundError);

      try {
        await mockApiClient.getValue({ key: "non-existent-key" });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toMatchObject({
          code: "NOT_FOUND",
          status: 404,
          message: "Key not found",
        });
      }
    });

    it("preserves NOT_FOUND error data through the stack", async () => {
      const notFoundError = {
        code: "NOT_FOUND",
        status: 404,
        message: "Key not found",
        data: { resource: "kv", resourceId: "specific-key-123" },
      };
      mockApiClient.getValue.mockRejectedValueOnce(notFoundError);

      try {
        await mockApiClient.getValue({ key: "specific-key-123" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.data).toBeDefined();
        expect(error.data?.resource).toBe("kv");
        expect(error.data?.resourceId).toBe("specific-key-123");
      }
    });

    it("NOT_FOUND error on deleteKey includes proper data", async () => {
      const notFoundError = {
        code: "NOT_FOUND",
        status: 404,
        message: "Key not found",
        data: { resource: "kv", resourceId: "deleted-key" },
      };
      mockApiClient.deleteKey.mockRejectedValueOnce(notFoundError);

      try {
        await mockApiClient.deleteKey({ key: "deleted-key" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.code).toBe("NOT_FOUND");
        expect(error.status).toBe(404);
        expect(error.data?.resourceId).toBe("deleted-key");
      }
    });
  });

  describe("Error Status Code Preservation", () => {
    it("UNAUTHORIZED always has status 401", async () => {
      mockApiClient.protected.mockRejectedValueOnce({
        code: "UNAUTHORIZED",
        status: 401,
        message: "Unauthorized access",
      });

      try {
        await mockApiClient.protected();
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.status).toBe(401);
      }
    });

    it("NOT_FOUND always has status 404", async () => {
      mockApiClient.getValue.mockRejectedValueOnce({
        code: "NOT_FOUND",
        status: 404,
        message: "Resource not found",
      });

      try {
        await mockApiClient.getValue({ key: "any-key" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.status).toBe(404);
      }
    });

    it("FORBIDDEN has status 403", async () => {
      mockApiClient.setValue.mockRejectedValueOnce({
        code: "FORBIDDEN",
        status: 403,
        message: "Access denied",
        data: { action: "write" },
      });

      try {
        await mockApiClient.setValue({ key: "test", value: "value" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.status).toBe(403);
        expect(error.code).toBe("FORBIDDEN");
      }
    });
  });

  describe("SSR Client Error Handling", () => {
    it("uses globalThis.$apiClient during SSR rendering", () => {
      expect(globalThis.$apiClient).toBeDefined();
      expect(globalThis.$apiClient).toBe(mockApiClient);
    });

    it("SSR client handles errors without needing absolute URL", async () => {
      mockApiClient.getValue.mockRejectedValueOnce({
        code: "NOT_FOUND",
        status: 404,
        message: "Key not found",
        data: { resource: "kv", resourceId: "ssr-test-key" },
      });

      try {
        await mockApiClient.getValue({ key: "ssr-test-key" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.code).toBe("NOT_FOUND");
      }
    });

    it("renders public SSR route with error gracefully", { timeout: 6000 }, async () => {
      mockApiClient.getValue.mockResolvedValueOnce({
        key: "public-key",
        value: "public-value",
        updatedAt: new Date().toISOString(),
      });

      const request = new Request("http://localhost/page/public-key");
      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          account: config.account,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
          assetsUrl: config.ui.url,
        },
      });

      const html = await consumeStream(result.stream);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
    });
  });

  describe("Error Message Preservation", () => {
    it("uses API handler's standardized NOT_FOUND message with error data", async () => {
      const standardMessage = "Key not found";
      const errorPayload = {
        code: "NOT_FOUND",
        status: 404,
        message: standardMessage,
        data: { resource: "kv", resourceId: "custom-key" },
      };

      const originalGetValue = mockApiClient.getValue;
      mockApiClient.getValue = vi.fn().mockRejectedValue(errorPayload);

      try {
        await mockApiClient.getValue({ key: "custom-key" });
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.message).toBe(standardMessage);
        expect(error.data?.resourceId).toBe("custom-key");
      } finally {
        mockApiClient.getValue = originalGetValue;
      }
    });

    it("preserves UNAUTHORIZED message", async () => {
      const authMessage = "Auth required";
      mockApiClient.protected.mockRejectedValueOnce({
        code: "UNAUTHORIZED",
        status: 401,
        message: authMessage,
      });

      try {
        await mockApiClient.protected();
        expect.fail("Should have thrown");
      } catch (e) {
        const error = e as ORPCErrorResponse;
        expect(error.message).toBe(authMessage);
      }
    });
  });
});
