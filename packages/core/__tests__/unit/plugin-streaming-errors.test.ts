import { expect, it } from "@effect/vitest";
import { Duration, Effect, Stream } from "effect";
import { describe } from "vitest";
import type { PluginRegistry } from "../../src/plugin";
import { PluginRuntime } from "../../src/runtime";
import { PluginRuntimeError, StreamError } from "../../src/runtime/errors";
import { createTestLayer, type TestPluginMap } from "../../src/testing";
import SourceTemplatePlugin from "../test-plugin/src/index";

// Test registry for streaming error tests
const TEST_REGISTRY: PluginRegistry = {
  "error-test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "0.0.1",
    description: "Mock plugin for streaming error testing",
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
  "error-test-plugin": SourceTemplatePlugin,
};

describe("Plugin Streaming Error Handling Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  describe("Error State Detection", () => {
    it.effect("should immediately terminate stream when plugin returns error state", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "error-test-plugin",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: { query: "trigger-error-state", limit: 5 },
            state: null,
          },
          {
            maxItems: 10,
            maxInvocations: 5
          }
        );

        return yield* stream.pipe(
          Stream.runCollect,
          Effect.catchTag("StreamError", (error) => {
            expect(error.operation).toBe("stream-termination");
            expect(error.pluginId).toBe("error-test-plugin");
            expect(error.cause?.message).toContain("Non-retryable error detected");
            return Effect.succeed([]);
          }),
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should continue streaming when plugin returns recoverable error state", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "error-test-plugin",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: { query: "trigger-recoverable-error", limit: 5 },
            state: null,
          },
          {
            maxItems: 3,
            maxInvocations: 3
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        const result = Array.from(items);
        // Should eventually get some items after retries
        expect(result.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
    );

    it.effect("should detect ConfigurationError in plugin state and terminate immediately", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "error-test-plugin",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: { query: "trigger-config-error", limit: 5 },
            state: null,
          }
        );

        return yield* stream.pipe(
          Stream.runCollect,
          Effect.catchTag("StreamError", (error) => {
            expect(error.operation).toBe("stream-termination");
            expect(error.cause?.name).toBe("ConfigurationError");
            expect(error.context?.procedureName).toBe("search");
            return Effect.succeed([]);
          }),
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should detect PluginExecutionError with retryable=false and terminate", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "error-test-plugin",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: { query: "trigger-non-retryable-execution-error", limit: 5 },
            state: null,
          }
        );

        return yield* stream.pipe(
          Stream.runCollect,
          Effect.catchTag("StreamError", (error) => {
            expect(error.operation).toBe("stream-termination");
            expect(error.cause?.name).toBe("PluginExecutionError");
            return Effect.succeed([]);
          }),
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Error Classification", () => {
    it.effect("should classify 401 Unauthorized as non-retryable ConfigurationError", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "error-test-plugin",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: { query: "401-unauthorized", limit: 5 },
            state: null,
          }
        );

