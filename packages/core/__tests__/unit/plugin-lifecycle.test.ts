import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";
import type { PluginRegistry } from "../../src/runtime/types";
import { PluginBinding } from "../../src/plugin";
import { createTestPluginRuntime, type TestPluginMap } from "../../src/testing";
import TestPlugin, { type testContract } from "../test-plugin/src/index";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry for lifecycle unit tests
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

// Plugin map for tests (mocking)
const TEST_PLUGIN_MAP: TestPluginMap = {
  "test-plugin": TestPlugin,
};

describe("Plugin Lifecycle Unit Tests", () => {
  const { runtime, PluginRuntime } = createTestPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: {
      API_KEY: "test-api-key-value",
    },
  }, TEST_PLUGIN_MAP);

  it.effect("should handle complete plugin lifecycle", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Test individual lifecycle steps
      const pluginConstructor = yield* pluginRuntime.loadPlugin("test-plugin");
      expect(pluginConstructor).toBeDefined();
      expect(pluginConstructor.metadata.pluginId).toBe("test-plugin");
      expect(pluginConstructor.metadata.type).toBe("source");

      const pluginInstance = yield* pluginRuntime.instantiatePlugin(pluginConstructor);
      expect(pluginInstance).toBeDefined();
      expect(pluginInstance.plugin).toBeDefined();
      expect(pluginInstance.plugin.id).toBe("test-plugin");
      expect(pluginInstance.plugin.type).toBe("source");

      const initializedPlugin = yield* pluginRuntime.initializePlugin(
        pluginInstance,
        TEST_CONFIG,
      );
      expect(initializedPlugin).toBeDefined();
      expect(initializedPlugin.config).toBeDefined();
      expect(initializedPlugin.config.secrets.apiKey).toBe("test-api-key-value");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle usePlugin convenience method", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Test usePlugin which combines load + instantiate + initialize
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      expect(plugin).toBeDefined();
      expect(plugin.plugin).toBeDefined();
      expect(plugin.plugin.id).toBe("test-plugin");
      expect(plugin.config).toBeDefined();
      expect(plugin.config.secrets.apiKey).toBe("test-api-key-value");

      // Verify plugin can create router
      const router = plugin.plugin.createRouter();
      expect(router).toBeDefined();
      expect(typeof router).toBe("object");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle plugin not found in registry", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // @ts-expect-error - means the types are really good!
      const result = yield* pluginRuntime.loadPlugin("non-existent-plugin").pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("validate-plugin-id");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("non-existent-plugin");
          expect(error.cause?.message).toContain("not found in registry");
          return Effect.succeed("plugin-not-found-handled");
        }),
      );

      expect(result).toBe("plugin-not-found-handled");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle config validation errors", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const result = yield* pluginRuntime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        // @ts-expect-error - means the types are really good!
        secrets: {}, // Missing required apiKey
      }).pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("validate-config");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("test-plugin");
          return Effect.succeed("validation-error-handled");
        }),
      );

      expect(result).toBe("validation-error-handled");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle plugin initialization errors", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const result = yield* pluginRuntime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "invalid-key" }, // This triggers initialization error
      }).pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("initialize-plugin");
          expect(error.pluginId).toBe("test-plugin");
          return Effect.succeed("initialization-error-handled");
        }),
      );

      expect(result).toBe("initialization-error-handled");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle connection failure during initialization", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const result = yield* pluginRuntime.usePlugin("test-plugin", {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "connection-fail" }, // This triggers connection error
      }).pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("initialize-plugin");
          expect(error.pluginId).toBe("test-plugin");
          expect(error.cause).toBeDefined();
          return Effect.succeed("connection-error-handled");
        }),
      );

      expect(result).toBe("connection-error-handled");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should handle runtime shutdown gracefully", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Initialize a plugin first
      const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);
      expect(plugin).toBeDefined();

      // Test shutdown
      yield* pluginRuntime.shutdown();

      // If we reach here, shutdown was successful
      expect(true).toBe(true);
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should cache plugins with same config", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Use same plugin with same config twice
      const plugin1 = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);
      const plugin2 = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      // Should be the same instance (cached)
      expect(plugin1).toBe(plugin2);
      expect(plugin1.plugin).toBe(plugin2.plugin);
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );

  it.effect("should create different instances for different configs", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const config1 = {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "key1" },
      };

      const config2 = {
        variables: { baseUrl: "http://localhost:1337" },
        secrets: { apiKey: "key2" },
      };

      // Use same plugin with different configs
      const plugin1 = yield* pluginRuntime.usePlugin("test-plugin", config1);
      const plugin2 = yield* pluginRuntime.usePlugin("test-plugin", config2);

      // Should be different instances
      expect(plugin1).not.toBe(plugin2);
      expect(plugin1.config.secrets.apiKey).toBe("key1");
      expect(plugin2.config.secrets.apiKey).toBe("key2");
    }).pipe(Effect.provide(runtime), Effect.timeout("4 seconds"))
  );
});
