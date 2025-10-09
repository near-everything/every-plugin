import type { PluginRegistry } from "every-plugin";
import { createLocalPluginRuntime } from "every-plugin/testing";
import { beforeAll, describe, expect, it } from "vitest";
import TemplatePlugin from "../../index";

const TEST_REGISTRY: PluginRegistry = {
  "@every-plugin/template": {
    remoteUrl: "http://localhost:3000/remoteEntry.js",
    version: "1.0.0",
    description: "Template plugin for integration testing",
  },
};

const TEST_PLUGIN_MAP = {
  "@every-plugin/template": TemplatePlugin,
} as const;

const TEST_CONFIG = {
  variables: {
    baseUrl: "https://api.example.com",
    timeout: 5000,
  },
  secrets: {
    apiKey: "test-api-key",
  },
};

describe("Template Plugin Integration Tests", () => {
  const runtime = createLocalPluginRuntime<typeof TEST_PLUGIN_MAP>(
    {
      registry: TEST_REGISTRY,
      secrets: { API_KEY: "test-api-key" },
    },
    TEST_PLUGIN_MAP
  );

  beforeAll(async () => {
    const { initialized } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);
    expect(initialized).toBeDefined();
    expect(initialized.plugin.id).toBe("@every-plugin/template");
  });

  describe("getById procedure", () => {
    it("should fetch item successfully", async () => {
      const { client } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);

      const result = await client.getById({ id: "test-123" });

      expect(result.item).toEqual({
        id: "test-123",
        title: "Item test-123",
        createdAt: expect.any(String),
      });
    });

    it("should handle not found error", async () => {
      const { client } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);

      await expect(
        client.getById({ id: "not-found" })
      ).rejects.toThrow("Failed to fetch item: Item not found");
    });
  });

  describe("search procedure", () => {
    it("should stream search results", async () => {
      const { client } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);

      const stream = await client.search({ query: "test-query", limit: 3 });

      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        item: {
          id: "test-query-0",
          title: "test-query result 1",
          createdAt: expect.any(String),
        },
        score: 1,
      });
      expect(results[1].score).toBe(0.9);
      expect(results[2].score).toBe(0.8);
    });

    it("should respect limit parameter", async () => {
      const { client } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);

      const stream = await client.search({ query: "limited", limit: 2 });

      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(2);
    });
  });

  describe("ping procedure", () => {
    it("should return healthy status", async () => {
      const { client } = await runtime.usePlugin("@every-plugin/template", TEST_CONFIG);

      const result = await client.ping();

      expect(result).toEqual({
        status: "ok",
        timestamp: expect.any(String),
      });
    });
  });
});
