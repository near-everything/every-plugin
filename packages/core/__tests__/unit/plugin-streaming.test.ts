import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { describe } from "vitest";
import type { PluginRegistry } from "../../src/plugin";
import { PluginRuntime } from "../../src/runtime";
import { createTestLayer, type TestPluginMap } from "../../src/testing";
import SourceTemplatePlugin from "../test-plugin/src/index";

// Test registry for streaming unit tests
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "0.0.1",
    description: "Mock plugin for streaming unit testing",
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

describe("Plugin Streaming Unit Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  it.effect("should stream plugin results with mock", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "test query", limit: 5 },
          state: null,
        },
        {
          maxItems: 10,
          maxInvocations: 3
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10);
      expect(result[0]).toHaveProperty('externalId');
      expect(result[0]).toHaveProperty('content');
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should respect maxItems limit in streaming", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "test query", limit: 10 },
          state: null,
        },
        {
          maxItems: 3,
          maxInvocations: 5
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBeLessThanOrEqual(3);
      expect(result.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should handle streaming validation errors", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Try to stream getById which is not streamable (no nextState)
      return yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "getById" as const,
          input: { id: "test-id" },
          state: null,
        }
      ).pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("stream-plugin-validate");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("test-plugin");
          expect(error.cause?.message).toContain("not streamable");
          return Effect.succeed("non-streamable-error-handled");
        }),
      );
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should call onStateChange hook during streaming", () =>
    Effect.gen(function* () {
      const stateChanges: Array<{ state: any; itemCount: number }> = [];
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "test query", limit: 5 },
          state: null,
        },
        {
          maxItems: 5,
          maxInvocations: 2,
          onStateChange: (newState: any, items: any[]) =>
            Effect.sync(() => {
              stateChanges.push({ state: newState, itemCount: items.length });
            })
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBeGreaterThan(0);
      expect(stateChanges.length).toBeGreaterThan(0);
      expect(stateChanges[0]).toHaveProperty('state');
      expect(stateChanges[0]).toHaveProperty('itemCount');
      expect(typeof stateChanges[0]?.itemCount).toBe('number');
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should handle streaming with invalid input", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      return yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: {}, // Missing required query field
          state: null,
        }
      ).pipe(
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("validate-input");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("test-plugin");
          return Effect.succeed("input-validation-error-handled");
        }),
      );
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );
});
