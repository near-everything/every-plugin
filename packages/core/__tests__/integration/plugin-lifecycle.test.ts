import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { describe } from "vitest";
import { createPluginClient } from "../../src/client/index";
import type { PluginBinding } from "../../src/plugin";
import { createPluginRuntime } from "../../src/runtime";
import type TestPlugin from "../test-plugin/src/index";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";

// Define typed registry bindings for the test plugin
type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

// Test registry using the real served plugin
const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    type: "source",
    version: "0.0.1",
    description: "Real test plugin for integration testing",
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

describe("Plugin Lifecycle Integration Tests", () => {
  const { runtime, PluginRuntime } = createPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it.effect("should complete full plugin lifecycle with real MF", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Test complete lifecycle: load → instantiate → initialize → execute
      const pluginConstructor = yield* pluginRuntime.loadPlugin("test-plugin");
      expect(pluginConstructor).toBeDefined();

      const pluginInstance = yield* pluginRuntime.instantiatePlugin(pluginConstructor);
      expect(pluginInstance).toBeDefined();
      expect(pluginInstance.plugin).toBeDefined();

      const initializedPlugin = yield* pluginRuntime.initializePlugin(
        pluginInstance,
        TEST_CONFIG,
      );
      expect(initializedPlugin).toBeDefined();
      expect(initializedPlugin.config).toBeDefined();

      const client = createPluginClient(initializedPlugin);
      const output = yield* Effect.tryPromise(() =>
        client.getById({ id: "integration-test" })
      );
      expect(output).toBeDefined();
    }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
  );

  it.effect("should execute getById with real plugin", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const { client } = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const result = yield* Effect.tryPromise(() =>
        client.getById({ id: "integration-test-id" })
      );

      expect(result).toBeDefined();
      expect(result.item).toBeDefined();
      expect(result.item.externalId).toBe("integration-test-id");
      expect(result.item.content).toContain("integration-test-id");
    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should execute getBulk with real plugin", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const { client } = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const result = yield* Effect.tryPromise(() =>
        client.getBulk({ ids: ["bulk1", "bulk2", "bulk3"] })
      );

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.items.length).toBe(3);
      expect(result.items[0].externalId).toBe("bulk1");
      expect(result.items[1].externalId).toBe("bulk2");
      expect(result.items[2].externalId).toBe("bulk3");
    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );

  it.effect("should handle streaming with real plugin", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const { client } = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

      const result = yield* Effect.tryPromise(() =>
        client.simpleStream({ count: 3, prefix: "integration" })
      );

      // Should be an AsyncIterable
      expect(result).not.toBeNull();
      expect(typeof result).toBe('object');
      expect(Symbol.asyncIterator in result).toBe(true);
    }).pipe(Effect.provide(runtime), Effect.timeout("15 seconds"))
  );

  it.effect("should handle validation errors with real plugin", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const result = yield* pluginRuntime
        .usePlugin("test-plugin", {
          variables: { baseUrl: "http://localhost:1337" },
          // @ts-expect-error - means the types are really good!
          secrets: {}, // Missing required apiKey
        })
        .pipe(
          Effect.catchTag("PluginRuntimeError", (error) => {
            expect(error.operation).toBe("validate-config");
            expect(error.retryable).toBe(false);
            expect(error.pluginId).toBe("test-plugin");
            return Effect.succeed("validation-error-handled");
          }),
        );

      expect(result).toBe("validation-error-handled");
    }).pipe(Effect.provide(runtime), Effect.timeout("10 seconds"))
  );
});
