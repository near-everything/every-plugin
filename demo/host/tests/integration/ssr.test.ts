import { Effect } from "every-plugin/effect";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadBosConfig, type RuntimeConfig } from "@/services/config";
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

const mockApiClient = {
  getValue: vi.fn().mockImplementation(({ key }: { key: string }) =>
    Promise.resolve({ key, value: `test-value-for-${key}` })
  ),
  setValue: vi.fn().mockResolvedValue({ success: true }),
  protected: vi.fn().mockResolvedValue({ message: "Protected data" }),
  listKeys: vi.fn().mockResolvedValue({ keys: [], total: 0, hasMore: false }),
};

describe("SSR Stream Lifecycle", () => {
  let routerModule: RouterModule;
  let config: RuntimeConfig;

  beforeAll(async () => {
    globalThis.$apiClient = mockApiClient;
    config = await loadBosConfig();
    routerModule = await Effect.runPromise(loadRouterModule(config));
  });

  describe("Stream Completion", () => {
    it("completes stream for root route without timeout", async () => {
      const startTime = Date.now();
      
      const head = await routerModule.getRouteHead("/", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const elapsed = Date.now() - startTime;
      
      expect(head).toBeDefined();
      expect(head.meta).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });

    it("completes stream for layout routes", async () => {
      const startTime = Date.now();
      
      const head = await routerModule.getRouteHead("/login", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const elapsed = Date.now() - startTime;
      
      expect(head).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });

    it("does not block on authenticated routes with ssr: false", async () => {
      const startTime = Date.now();
      
      const head = await routerModule.getRouteHead("/keys", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const elapsed = Date.now() - startTime;
      
      expect(head).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });

    it("handles dynamic authenticated routes without blocking", async () => {
      const startTime = Date.now();
      
      const head = await routerModule.getRouteHead("/keys/test-key-123", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const elapsed = Date.now() - startTime;
      
      expect(head).toBeDefined();
      expect(elapsed).toBeLessThan(5000);
    });
  });

  describe("SSR Configuration", () => {
    it("renders layout route metadata", async () => {
      const head = await routerModule.getRouteHead("/", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const titleMeta = head.meta.find(
        (m) => m && typeof m === "object" && "title" in m
      );
      expect(titleMeta).toBeDefined();
    });

    it("authenticated route head does not trigger auth check during SSR", async () => {
      const authCallsBefore = mockApiClient.protected.mock.calls.length;
      
      await routerModule.getRouteHead("/keys", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const authCallsAfter = mockApiClient.protected.mock.calls.length;
      expect(authCallsAfter).toBe(authCallsBefore);
    });
  });

  describe("Public SSR Routes", () => {
    const STREAM_TIMEOUT = 5000;

    it("renders public /p/{key} route with full SSR", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/p/test-public-key");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(html).toContain("test-public-key");
    });

    it("includes OG metadata in public route head", async () => {
      const head = await routerModule.getRouteHead("/p/my-og-test", {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      expect(head).toBeDefined();
      expect(head.meta).toBeDefined();

      const ogTitle = head.meta.find(
        (m) => m && typeof m === "object" && "property" in m && m.property === "og:title"
      );
      const ogDescription = head.meta.find(
        (m) => m && typeof m === "object" && "property" in m && m.property === "og:description"
      );
      const ogImage = head.meta.find(
        (m) => m && typeof m === "object" && "property" in m && m.property === "og:image"
      );

      expect(ogTitle).toBeDefined();
      expect(ogDescription).toBeDefined();
      expect(ogImage).toBeDefined();
    });

    it("renders key parameter in full SSR stream", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/p/rendered-key-value");

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);

      expect(html).toContain("rendered-key-value");
      expect(html).toContain("Public Page:");
    });
  });

  describe("Full Stream Rendering", () => {
    const STREAM_TIMEOUT = 5000;

    it("completes full stream render for root route", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
    });

    it("completes full stream render for /login route", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/login");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
    });

    it("completes full stream render for authenticated route /keys/test-key", { timeout: 6000 }, async () => {
      const request = new Request("http://localhost/keys/test-key");
      const startTime = Date.now();

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(STREAM_TIMEOUT);
      expect(result.statusCode).toBe(200);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("test-key");
    });

    it("does NOT call API during SSR for ssr:false authenticated routes", { timeout: 6000 }, async () => {
      mockApiClient.getValue.mockClear();
      const request = new Request("http://localhost/keys/my-test-key");

      const result = await routerModule.renderToStream(request, {
        assetsUrl: config.ui.url,
        runtimeConfig: {
          env: config.env,
          title: config.title,
          hostUrl: config.hostUrl,
          apiBase: "/api",
          rpcBase: "/api/rpc",
        },
      });

      const html = await consumeStream(result.stream);

      expect(html).toContain("my-test-key");
      expect(mockApiClient.getValue).not.toHaveBeenCalled();
    });
  });
});
