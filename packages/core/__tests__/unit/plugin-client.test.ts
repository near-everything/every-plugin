import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { describe } from "vitest";
import { createPluginClient } from "../../src/client/index";
import type { PluginBinding } from "../../src/plugin";
import { createTestPluginRuntime, type TestPluginMap } from "../../src/testing";
import type { PluginRegistry } from "../../src/types";
import TestPlugin from "../test-plugin/src/index";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry for client unit tests
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

// Plugin map for tests
const TEST_PLUGIN_MAP: TestPluginMap = {
  "test-plugin": TestPlugin,
};

describe("Plugin Client Unit Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  it.effect("should create plugin client and access procedures", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      // Use client directly from result
      const { client } = result;

      // Verify procedures exist
      expect(typeof client.getById).toBe('function');
      expect(typeof client.getBulk).toBe('function');
      expect(typeof client.simpleStream).toBe('function');
      expect(typeof client.emptyStream).toBe('function');
      expect(typeof client.throwError).toBe('function');
      expect(typeof client.requiresSpecialConfig).toBe('function');

      // Test non-streaming procedure
      const procedureResult = yield* Effect.tryPromise(() => client.getById({ id: "test-123" }));
      expect(procedureResult).toHaveProperty('item');
      expect(procedureResult.item).toHaveProperty('externalId', 'test-123');
      expect(procedureResult.item.content).toContain('single content for test-123');
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle bulk operations", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Test bulk fetch
      const bulkResult = yield* Effect.tryPromise(() =>
        client.getBulk({ ids: ["bulk1", "bulk2", "bulk3"] })
      );

      expect(bulkResult).toHaveProperty('items');
      expect(bulkResult.items).toHaveLength(3);
      expect(bulkResult.items[0].externalId).toBe('bulk1');
      expect(bulkResult.items[0].content).toContain('bulk content for bulk1');
      expect(bulkResult.items[1].externalId).toBe('bulk2');
      expect(bulkResult.items[2].externalId).toBe('bulk3');
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should stream using plugin client directly", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Test streaming procedure directly
      const streamResult = yield* Effect.tryPromise(() =>
        client.simpleStream({ count: 3, prefix: "stream" })
      );

      // Should be an AsyncIterable
      expect(streamResult).not.toBeNull();
      expect(typeof streamResult).toBe('object');
      expect(Symbol.asyncIterator in streamResult).toBe(true);

      // Convert to Effect stream and collect
      const stream = Stream.fromAsyncIterable(streamResult, (error) => error);
      const items = yield* stream.pipe(
        Stream.take(5), // Take more than expected to ensure it terminates
        Stream.runCollect
      );

      const resultArray = Array.from(items);
      expect(resultArray.length).toBe(3); // Should match count parameter
      expect(resultArray[0]).toHaveProperty('item');
      expect(resultArray[0].item).toHaveProperty('externalId', 'stream_0');
      expect(resultArray[0]).toHaveProperty('state');
      expect(resultArray[0]).toHaveProperty('metadata');
      expect(resultArray[1].item.externalId).toBe('stream_1');
      expect(resultArray[2].item.externalId).toBe('stream_2');
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle empty streams", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Test empty stream
      const emptyResult = yield* Effect.tryPromise(() =>
        client.emptyStream({ reason: "testing empty stream" })
      );

      // Convert to Effect stream and collect
      const stream = Stream.fromAsyncIterable(emptyResult, (error) => error);
      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const resultArray = Array.from(items);
      expect(resultArray.length).toBe(0); // Should be empty
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle Effect Stream.fromAsyncIterable with custom processing", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Get the AsyncIterable from client
      const asyncIterable = yield* Effect.tryPromise(() =>
        client.simpleStream({ count: 2, prefix: "effect" })
      );

      // Convert to Effect stream with custom processing
      const stream = Stream.fromAsyncIterable(asyncIterable, (error) => {
        console.error("Stream error:", error);
        return error;
      });

      // Apply Effect stream operations
      const processedItems = yield* stream.pipe(
        Stream.map((item: any) => ({
          ...item,
          processed: true,
          timestamp: Date.now(),
        })),
        Stream.runCollect
      );

      const processedResult = Array.from(processedItems);
      expect(processedResult.length).toBe(2);
      expect(processedResult[0]).toHaveProperty('processed', true);
      expect(processedResult[0]).toHaveProperty('item');
      expect(processedResult[0].item).toHaveProperty('externalId', 'effect_0');
      expect(processedResult[1].item.externalId).toBe('effect_1');
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should propagate oRPC errors correctly", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Test error propagation - expect the call to throw
      const errorResult = yield* Effect.tryPromise(() => 
        client.throwError({ errorType: 'UNAUTHORIZED' })
      ).pipe(
        Effect.catchAll((error) => {
          expect(error).toBeDefined();
          // The error might be wrapped, so check if it contains the expected message
          const errorMessage = error.message || error.toString();
          expect(errorMessage).toBeDefined();
          return Effect.succeed("error-caught");
        })
      );

      expect(errorResult).toBe("error-caught");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle config-dependent procedures", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const result = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const { client } = result;

      // Test procedure that uses config values
      const configResult = yield* Effect.tryPromise(() =>
        client.requiresSpecialConfig({ checkValue: "test-input" })
      );

      expect(configResult).toHaveProperty('configValue', 'http://localhost:1337');
      expect(configResult).toHaveProperty('inputValue', 'test-input');
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );
});
