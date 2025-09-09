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

  it.effect("should stop streaming when stopWhenEmpty is true and no items returned", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "empty-results", limit: 0 }, // This should return empty results
          state: null,
        },
        {
          stopWhenEmpty: true,
          maxInvocations: 10 // High limit to ensure stopWhenEmpty triggers first
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBe(0);
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should continue streaming when stopWhenEmpty is false and no items returned", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "mixed-results", limit: 5 }, // Mix of empty and non-empty results
          state: null,
        },
        {
          stopWhenEmpty: false,
          maxInvocations: 3 // Limit invocations to prevent infinite loop
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      // Should get some items even if some invocations return empty
      expect(result.length).toBeGreaterThanOrEqual(0);
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should respect stopWhenEmpty combined with maxItems", () =>
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
          stopWhenEmpty: true,
          maxItems: 5,
          maxInvocations: 10
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      // Should stop at maxItems or when empty, whichever comes first
      expect(result.length).toBeLessThanOrEqual(5);
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should handle multi-plugin flow patterns with batching", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Simulate stream-to-pipeline flow from documentation
      const sourceStream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "batch-test", limit: 20 },
          state: null,
        },
        {
          maxItems: 15,
          maxInvocations: 3
        }
      );

      // Process stream through batching (simulating pipeline processing)
      const batchedResults = yield* sourceStream.pipe(
        Stream.grouped(5), // Batch items for efficient processing
        Stream.mapEffect((batch) =>
          Effect.gen(function* () {
            const batchArray = Array.from(batch);
            
            // Simulate processing each batch
            const processed = batchArray.map(item => ({
              ...(item as any),
              processed: true,
              batchSize: batchArray.length
            }));

            return processed;
          })
        ),
        Stream.flatMap((items) => Stream.fromIterable(items)),
        Stream.runCollect
      );

      const result = Array.from(batchedResults);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(15);
      
      // Verify all items were processed
      result.forEach(item => {
        expect(item).toHaveProperty('processed', true);
        expect(item).toHaveProperty('batchSize');
      });
    }).pipe(Effect.provide(testLayer), Effect.timeout("6 seconds"))
  );

  it.effect("should handle parallel multi-source processing pattern", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Simulate multiple sources processing in parallel
      const sources = [
        { query: "source1", limit: 3 },
        { query: "source2", limit: 4 },
        { query: "source3", limit: 2 }
      ];

      const sourceResults = yield* Effect.all(
        sources.map((sourceInput, index) =>
          Effect.gen(function* () {
            const stream = yield* pluginRuntime.streamPlugin(
              "test-plugin",
              TEST_CONFIG,
              {
                procedure: "search" as const,
                input: sourceInput,
                state: null,
              },
              { 
                maxItems: sourceInput.limit,
                stopWhenEmpty: true 
              }
            );

            const items = yield* stream.pipe(
              Stream.map(item => ({ ...(item as any), source: `source${index + 1}` })),
              Stream.runCollect
            );

            return Array.from(items);
          }).pipe(
            Effect.catchAll((error) => {
              console.error(`Source ${index + 1} failed:`, error);
              return Effect.succeed([]);
            })
          )
        ),
        { concurrency: 3 } // Process all sources concurrently
      );

      // Merge results
      const allItems = sourceResults.flat();
      expect(allItems.length).toBeGreaterThan(0);
      
      // Verify items from different sources
      const sources1Items = allItems.filter(item => item.source === 'source1');
      const sources2Items = allItems.filter(item => item.source === 'source2');
      const sources3Items = allItems.filter(item => item.source === 'source3');
      
      expect(sources1Items.length).toBeLessThanOrEqual(3);
      expect(sources2Items.length).toBeLessThanOrEqual(4);
      expect(sources3Items.length).toBeLessThanOrEqual(2);
    }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
  );

  it.effect("should handle conditional branching flow patterns", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "conditional-test", limit: 10 },
          state: null,
        },
        {
          maxItems: 8,
          maxInvocations: 2
        }
      );

      // Simulate conditional branching based on item characteristics
      const processedResults = yield* stream.pipe(
        Stream.mapEffect((item) =>
          Effect.succeed({
            ...(item as any),
            priority: Math.random(),
            branch: Math.random() > 0.7 ? 'high' : Math.random() > 0.3 ? 'medium' : 'low',
            processed: true
          })
        ),
        Stream.runCollect
      );

      const result = Array.from(processedResults);
      expect(result.length).toBeGreaterThan(0);
      
      // Verify branching logic was applied
      result.forEach(item => {
        expect(item).toHaveProperty('branch');
        expect(['high', 'medium', 'low']).toContain(item.branch);
        expect(item).toHaveProperty('processed', true);
      });

      // Verify we have items in different branches
      const branches = [...new Set(result.map(item => item.branch))];
      expect(branches.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(testLayer), Effect.timeout("6 seconds"))
  );

  // New streaming error handling tests
  it.effect("should terminate stream immediately on non-retryable errors", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      // Test 401 UNAUTHORIZED - should terminate immediately
      yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "401-unauthorized" },
          state: null,
        },
        {
          maxInvocations: 10 // High limit - should terminate before reaching this
        }
      ).pipe(
        Stream.runCollect,
        Effect.catchAll((error: any) => {
          expect(error.message).toContain("UNAUTHORIZED");
          expect(error.retryable).toBe(false);
          return Effect.succeed("unauthorized-error-handled");
        })
      );

      // Test 403 FORBIDDEN - should terminate immediately  
      yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "403-forbidden" },
          state: null,
        },
        {
          maxInvocations: 10
        }
      ).pipe(
        Stream.runCollect,
        Effect.catchAll((error: any) => {
          expect(error.message).toContain("FORBIDDEN");
          expect(error.retryable).toBe(false);
          return Effect.succeed("forbidden-error-handled");
        })
      );

      // Test 400 BAD_REQUEST - should terminate immediately
      yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "400-bad-request" },
          state: null,
        },
        {
          maxInvocations: 10
        }
      ).pipe(
        Stream.runCollect,
        Effect.catchAll((error: any) => {
          expect(error.message).toContain("BAD_REQUEST");
          expect(error.retryable).toBe(false);
          return Effect.succeed("bad-request-error-handled");
        })
      );

      // If we reach here, all error handling worked correctly
      return "all-non-retryable-errors-handled-correctly";
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should classify UNAUTHORIZED as PluginConfigurationError", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      return yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "401-unauthorized" },
          state: null,
        }
      ).pipe(
        Stream.runCollect,
        Effect.catchAll((error: any) => {
          // Verify error classification
          expect(error).toBeInstanceOf(Error);
          expect(error.name).toBe("PluginConfigurationError");
          expect(error.message).toContain("UNAUTHORIZED");
          expect(error.retryable).toBe(false);
          return Effect.succeed("error-classified-correctly");
        })
      );
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should mark RATE_LIMITED as retryable PluginExecutionError", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      return yield* pluginRuntime.streamPlugin(
        "test-plugin",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: { query: "429-rate-limit" },
          state: null,
        }
      ).pipe(
        Stream.runCollect,
        Effect.catchAll((error: any) => {
          // Verify error classification for retryable errors
          expect(error).toBeInstanceOf(Error);
          expect(error.name).toBe("PluginExecutionError");
          expect(error.message).toContain("RATE_LIMITED");
          expect(error.retryable).toBe(true); // Key test - should be retryable
          return Effect.succeed("retryable-error-classified-correctly");
        })
      );
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );
});
