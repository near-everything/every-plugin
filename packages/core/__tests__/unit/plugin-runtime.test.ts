import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";
import type { PluginRegistry } from "../../src/plugin";
import { PluginRuntime } from "../../src/runtime";
import { createTestLayer, type TestPluginMap } from "../../src/testing";
import SourceTemplatePlugin from "../test-plugin/src/index";

// Test registry for unit tests
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "0.0.1",
    description: "Mock plugin for unit testing",
  },
  "invalid-plugin": {
    remoteUrl: "https://invalid-plugin-url.com/plugin.js",
    type: "transformer" as const,
    version: "1.0.0",
    description: "Invalid plugin for testing error handling",
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
  "test-plugin": SourceTemplatePlugin,
};

describe("Plugin Runtime Unit Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  it.effect("should handle plugin lifecycle with mocked MF service", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Test individual lifecycle steps with mock
      const pluginConstructor = yield* pluginRuntime.loadPlugin("test-plugin");
      expect(pluginConstructor).toBeDefined();
      expect(pluginConstructor.metadata.pluginId).toBe("test-plugin");

      const pluginInstance = yield* pluginRuntime.instantiatePlugin(pluginConstructor);
      expect(pluginInstance).toBeDefined();
      expect(pluginInstance.plugin).toBeDefined();

      const initializedPlugin = yield* pluginRuntime.initializePlugin(
        pluginInstance,
        TEST_CONFIG,
      );
      expect(initializedPlugin).toBeDefined();
      expect(initializedPlugin.config).toBeDefined();

      const output = yield* pluginRuntime.executePlugin(
        initializedPlugin,
        {
          procedure: "search" as const,
          input: { query: "test", limit: 2 },
          state: null,
        },
      );
      expect(output).toBeDefined();
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("should execute getById procedure with mock", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getById" as const,
        input: { id: "test-id-123" },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { item: any };
      expect(typedResult.item).toBeDefined();
      expect(typedResult.item.externalId).toBe("test-id-123");
      expect(typedResult.item.content).toContain("Content for item test-id-123");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("should execute getBulk procedure with mock", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getBulk" as const,
        input: { ids: ["id1", "id2", "id3"] },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBe(3);
      expect(typedResult.items[0].externalId).toBe("id1");
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("should execute search procedure with mock", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "search" as const,
        input: { query: "test query", limit: 3 },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[]; nextState?: any };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBeGreaterThan(0);
      expect(typedResult.items[0].content).toContain("test query");
      expect(typedResult.nextState).toBeDefined();
    }).pipe(Effect.provide(testLayer))
  );

  it.effect("should handle plugin not found in registry", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      return yield* pluginRuntime.loadPlugin("non-existent-plugin").pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("load-plugin");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("non-existent-plugin");
          expect(error.cause?.message).toContain("not found in registry");
          return Effect.succeed("plugin-not-found-handled");
        }),
      );
    }).pipe(
      Effect.provide(createTestLayer({
        registry: {},
        secrets: {},
      }, {}))
    )
  );

  it.effect("should handle runtime shutdown gracefully", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      yield* pluginRuntime.shutdown();
      expect(true).toBe(true); // If we reach here, shutdown was successful
    }).pipe(Effect.provide(testLayer))
  );
});
