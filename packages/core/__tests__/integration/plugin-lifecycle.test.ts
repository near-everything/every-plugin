import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../../src/plugin";
import { createPluginRuntime, PluginRuntime } from "../../src/runtime";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";

// Test registry using the real served plugin
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    type: "source",
    version: "0.0.1",
    description: "Real test plugin for integration testing",
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

describe("Plugin Lifecycle Integration Tests", () => {
  it("should complete full plugin lifecycle with real MF", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    try {
      await runtime.runPromise(
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

          const output = yield* pluginRuntime.executePlugin(
            initializedPlugin,
            {
              procedure: "search" as const,
              input: { query: "integration test", limit: 3 },
              state: null,
            },
          );
          expect(output).toBeDefined();
        }),
      );
    } finally {
      await runtime.dispose();
    }
  }, 15000);

  it("should execute getById with real plugin", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    try {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;
          const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

          const output = yield* pluginRuntime.executePlugin(plugin, {
            procedure: "getById" as const,
            input: { id: "integration-test-id" },
            state: null,
          });

          return output;
        })
      );

      expect(result).toBeDefined();
      const typedResult = result as { item: any };
      expect(typedResult.item).toBeDefined();
      expect(typedResult.item.externalId).toBe("integration-test-id");
      expect(typedResult.item.content).toContain("integration-test-id");
    } finally {
      await runtime.dispose();
    }
  }, 10000);

  it("should execute getBulk with real plugin", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    try {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;
          const plugin = yield* pluginRuntime.usePlugin("test-plugin", TEST_CONFIG);

          const output = yield* pluginRuntime.executePlugin(plugin, {
            procedure: "getBulk" as const,
            input: { ids: ["bulk1", "bulk2", "bulk3"] },
            state: null,
          });

          return output;
        })
      );

      expect(result).toBeDefined();
      const typedResult = result as { items: any[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBe(3);
      expect(typedResult.items[0].externalId).toBe("bulk1");
      expect(typedResult.items[1].externalId).toBe("bulk2");
      expect(typedResult.items[2].externalId).toBe("bulk3");
    } finally {
      await runtime.dispose();
    }
  }, 10000);

  it("should handle search workflow phases with real plugin", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    try {
      const pluginRuntime = await runtime.runPromise(PluginRuntime);
      const plugin = await runtime.runPromise(
        pluginRuntime.usePlugin("test-plugin", TEST_CONFIG)
      );

      // Phase 1: null state → historical job
      const phase1 = await runtime.runPromise(
        pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: { query: "workflow test", limit: 5 },
          state: null,
        })
      );

      const phase1Result = phase1 as { items: any[]; nextState: any };
      expect(phase1Result.items).toHaveLength(3);
      expect(phase1Result.items[0]?.content).toContain("Historical");
      expect(phase1Result.nextState.phase).toBe("historical");
      expect(phase1Result.nextState.jobId).toMatch(/^hist_\d+$/);

      // Phase 2: historical phase → more historical items
      const phase2 = await runtime.runPromise(
        pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: { query: "workflow test", limit: 5 },
          state: phase1Result.nextState,
        })
      );

      const phase2Result = phase2 as { items: any[]; nextState: any };
      expect(phase2Result.items).toHaveLength(3);
      expect(phase2Result.items[0]?.content).toContain("Historical");
      expect(phase2Result.nextState.phase).toBe("realtime");

      // Phase 3: realtime phase → realtime items
      const phase3 = await runtime.runPromise(
        pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: { query: "workflow test", limit: 5 },
          state: phase2Result.nextState,
        })
      );

      const phase3Result = phase3 as { items: any[]; nextState: any };
      expect(phase3Result.items.length).toBeGreaterThanOrEqual(0); // Realtime can return 0-2 items randomly
      expect(phase3Result.nextState.phase).toBe("realtime");
    } finally {
      await runtime.dispose();
    }
  }, 15000);

  it("should handle validation errors with real plugin", async () => {
    const runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });

    try {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;

          return yield* pluginRuntime
            .usePlugin("test-plugin", {
              variables: { baseUrl: "http://localhost:1337" },
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
        })
      );

      expect(result).toBe("validation-error-handled");
    } finally {
      await runtime.dispose();
    }
  }, 10000);
});
