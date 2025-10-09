import { beforeAll, describe, expect, it } from "vitest";
import { createLocalPluginRuntime } from "../../src/testing";
import type { EveryPlugin, PluginRegistry } from "../../src/types";
import TestPlugin from "../test-plugin/src/index";

const TEST_PLUGIN_MAP = {
  "test-plugin": TestPlugin,
} as const;

const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
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

describe("Plugin Client Unit Tests", () => {
  const runtime = createLocalPluginRuntime({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  let plugin: EveryPlugin.Infer<typeof runtime, "test-plugin">;

  beforeAll(async () => {
    plugin = await runtime.usePlugin("test-plugin", TEST_CONFIG);
  });

  it("should create plugin client and access procedures", async () => {
    const { client } = plugin;

    expect(typeof client.getById).toBe('function');
    expect(typeof client.getBulk).toBe('function');
    expect(typeof client.simpleStream).toBe('function');
    expect(typeof client.emptyStream).toBe('function');
    expect(typeof client.throwError).toBe('function');
    expect(typeof client.requiresSpecialConfig).toBe('function');

    const procedureResult = await client.getById({ id: "test-123" });
    expect(procedureResult).toHaveProperty('item');
    expect(procedureResult.item).toHaveProperty('externalId', 'test-123');
    expect(procedureResult.item.content).toContain('single content for test-123');
  });

  it("should handle bulk operations", async () => {
    const { client } = plugin;

    const bulkResult = await client.getBulk({ ids: ["bulk1", "bulk2", "bulk3"] });

    expect(bulkResult).toHaveProperty('items');
    expect(bulkResult.items).toHaveLength(3);
    expect(bulkResult.items[0].externalId).toBe('bulk1');
    expect(bulkResult.items[0].content).toContain('bulk content for bulk1');
    expect(bulkResult.items[1].externalId).toBe('bulk2');
    expect(bulkResult.items[2].externalId).toBe('bulk3');
  });

  it("should stream using plugin client directly", async () => {
    const { client } = plugin;

    const streamResult = await client.simpleStream({ count: 3, prefix: "stream" });

    expect(streamResult).not.toBeNull();
    expect(typeof streamResult).toBe('object');
    expect(Symbol.asyncIterator in streamResult).toBe(true);

    const resultArray: any[] = [];
    for await (const item of streamResult) {
      resultArray.push(item);
    }

    expect(resultArray.length).toBe(3);
    expect(resultArray[0]).toHaveProperty('item');
    expect(resultArray[0].item).toHaveProperty('externalId', 'stream_0');
    expect(resultArray[0]).toHaveProperty('state');
    expect(resultArray[0]).toHaveProperty('metadata');
    expect(resultArray[1].item.externalId).toBe('stream_1');
    expect(resultArray[2].item.externalId).toBe('stream_2');
  });

  it("should handle empty streams", async () => {
    const { client } = plugin;

    const emptyResult = await client.emptyStream({ reason: "testing empty stream" });

    const resultArray: any[] = [];
    for await (const item of emptyResult) {
      resultArray.push(item);
    }

    expect(resultArray.length).toBe(0);
  });

  it("should handle async iteration with custom processing", async () => {
    const { client } = plugin;

    const asyncIterable = await client.simpleStream({ count: 2, prefix: "effect" });

    const processedResult: any[] = [];
    for await (const item of asyncIterable) {
      processedResult.push({
        ...item,
        processed: true,
        timestamp: Date.now(),
      });
    }

    expect(processedResult.length).toBe(2);
    expect(processedResult[0]).toHaveProperty('processed', true);
    expect(processedResult[0]).toHaveProperty('item');
    expect(processedResult[0].item).toHaveProperty('externalId', 'effect_0');
    expect(processedResult[1].item.externalId).toBe('effect_1');
  });

  it("should propagate oRPC errors correctly", async () => {
    const { client } = plugin;

    await expect(
      client.throwError({ errorType: 'UNAUTHORIZED' })
    ).rejects.toThrow();
  });

  it("should handle config-dependent procedures", async () => {
    const { client } = plugin;

    const configResult = await client.requiresSpecialConfig({ checkValue: "test-input" });

    expect(configResult).toHaveProperty('configValue', 'http://localhost:1337');
    expect(configResult).toHaveProperty('inputValue', 'test-input');
  });
});
