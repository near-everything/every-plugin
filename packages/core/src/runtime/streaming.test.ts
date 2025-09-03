import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugin";
import { createPluginRuntime, PluginRuntime } from "./index";

// Import types from the source plugin
type SourceItem = {
  externalId: string;
  content: string;
  contentType?: string;
  createdAt?: string;
  url?: string;
  authors?: Array<{
    id?: string;
    username?: string;
    displayName?: string;
    url?: string;
  }>;
  raw: unknown;
};

type SourceState = {
  pageNumber?: number;
  cursor?: string;
  lastItemId?: string;
};

// Test registry with our example source plugin
const TEST_REGISTRY: PluginRegistry = {
  "test-source-plugin": {
    remoteUrl: "http://localhost:3001/remoteEntry.js",
    type: "source",
    version: "0.0.1",
    description: "Example source plugin for streaming tests",
  },
	"test-plugin": {
		remoteUrl: "http://localhost:3000/remoteEntry.js",
		type: "transformer",
		version: "0.0.1",
		description: "Local template plugin for testing",
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

// Contract-based input for search procedure
const TEST_SEARCH_INPUT = {
  procedure: "search" as const,
  input: {
    query: "test query",
    limit: 10,
  },
  state: null,
};

// Contract-based input for getById procedure
const TEST_GETBYID_INPUT = {
  procedure: "getById" as const,
  input: {
    id: "test-id-123",
  },
  state: null,
};

// Contract-based input for getBulk procedure
const TEST_GETBULK_INPUT = {
  procedure: "getBulk" as const,
  input: {
    ids: ["id1", "id2", "id3"],
  },
  state: null,
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

describe("Plugin Streaming", () => {
  let runtime: ReturnType<typeof createPluginRuntime>;

  beforeEach(() => {
    runtime = createPluginRuntime({
      registry: TEST_REGISTRY,
      secrets: SECRETS_CONFIG,
    });
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.dispose();
    }
  });

  it("should create a stream from source plugin", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Create stream
        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            maxItems: 4, // Limit to 4 items total
            maxIterations: 2, // Limit to 2 plugin executions
          }
        );

        // Collect all items from the stream
        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return Array.from(items);
      })
    );

    // Verify we got items
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(4);

    // Verify item structure
    expect(result.length).toBeGreaterThan(0);
    const firstItem = result[0] as SourceItem;
    expect(firstItem).toHaveProperty("externalId");
    expect(firstItem).toHaveProperty("content");
    expect(firstItem).toHaveProperty("raw");
    expect(firstItem.content).toContain("test query");
  });

  it("should handle streaming with state callbacks", async () => {
    const collectedItems: SourceItem[] = [];
    const stateChanges: Array<{ state: SourceState; iterationCount: number }> = [];
    const iterationContexts: Array<{ iteration: { count: number; itemsProcessed: number; lastExecutionAt: Date }; pluginId: string }> = [];

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            maxIterations: 2,
            onItems: (items, context, state) => Effect.sync(() => {
              collectedItems.push(...(items as SourceItem[]));
              iterationContexts.push({
                iteration: context.iteration,
                pluginId: context.pluginId,
              });
            }),
            onStateChange: (state, context) => Effect.sync(() => {
              stateChanges.push({
                state: (state as SourceState) || { pageNumber: 1 },
                iterationCount: context.iteration.count,
              });
            }),
          }
        );

        // Run the stream
        yield* stream.pipe(Stream.runDrain);

        return {
          itemsCollected: collectedItems.length,
          stateChanges: stateChanges.length,
          iterations: iterationContexts.length,
        };
      })
    );

    // Verify callbacks were called
    expect(result.itemsCollected).toBeGreaterThan(0);
    expect(result.stateChanges).toBeGreaterThan(0);
    expect(result.iterations).toBeGreaterThan(0);

    // Verify state progression
    expect(stateChanges.length).toBeGreaterThan(0);
    const firstStateChange = stateChanges[0];
    expect(firstStateChange).toBeDefined();
    expect(firstStateChange?.state).toHaveProperty("pageNumber");
    expect(firstStateChange?.state.pageNumber).toBe(2); // Should be page 2 after first execution

    // Verify iteration context
    expect(iterationContexts.length).toBeGreaterThan(0);
    const firstIteration = iterationContexts[0];
    expect(firstIteration).toBeDefined();
    expect(firstIteration?.pluginId).toBe("test-source-plugin");
    expect(firstIteration?.iteration.count).toBe(1);
  });

  it("should respect maxItems limit", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            maxItems: 3, // Strict limit
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return items;
      })
    );

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("should respect maxIterations limit", async () => {
    let iterationCount = 0;

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            maxIterations: 1, // Only one plugin execution
            onIterationComplete: (context, state) => Effect.sync(() => {
              iterationCount = context.iteration.count;
            }),
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return items;
      })
    );

    expect(iterationCount).toBe(1);
    expect(result.length).toBeGreaterThan(0); // Should have items from the one execution
  });

  it("should handle stopWhenEmpty option", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Start from a state that will produce no results (page 10)
        const inputWithHighPage = {
          ...TEST_SEARCH_INPUT,
          state: {
            pageNumber: 10, // Beyond our mock data range
          },
        };

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          inputWithHighPage,
          {
            stopWhenEmpty: true,
            maxIterations: 5, // Would normally allow more iterations
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return items;
      })
    );

    // Should stop immediately when no items are returned
    expect(result.length).toBe(0);
  });

  it("should handle custom stop condition", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            stopCondition: (item, context, state) => {
              // Stop when we see an item from page 2
              return (item as SourceItem).externalId.includes("_2_");
            },
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return items;
      })
    );

    // Should stop when it encounters an item from page 2
    expect(result.length).toBeGreaterThan(0);
    const resultArray = Array.from(result);
    const lastItem = resultArray[resultArray.length - 1] as SourceItem;
    expect(lastItem.externalId).toContain("_2_");
  });

  it("should validate plugin type", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        return yield* pluginRuntime.streamPlugin(
          "test-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT
        ).pipe(
          Effect.catchTag("PluginRuntimeError", (error) => {
            expect(error.operation).toBe("stream-plugin-validate");
            expect(error.cause?.message).toContain("not a source plugin");
            return Effect.succeed("validation-error-handled");
          })
        );
      })
    );

    expect(result).toBe("validation-error-handled");
  });

  it("should handle error recovery with continueOnError", async () => {
    let errorCount = 0;

    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "test-source-plugin",
          TEST_CONFIG,
          TEST_SEARCH_INPUT,
          {
            maxIterations: 3,
            continueOnError: true,
            onError: (error, context, state) => Effect.sync(() => {
              errorCount++;
            }),
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return items;
      })
    );

    // Should continue streaming even if errors occur
    expect(result).toBeDefined();
    // Note: This test assumes the mock plugin doesn't actually error,
    // but demonstrates the error handling structure
  });

  describe("Contract-based Procedures", () => {
    it("should execute getById procedure", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;
          const plugin = yield* pluginRuntime.usePlugin("test-source-plugin", TEST_CONFIG);
          
          const output = yield* pluginRuntime.executePlugin(plugin, TEST_GETBYID_INPUT);
          
          return output;
        })
      );

      expect(result).toBeDefined();
      const typedResult = result as { item: SourceItem };
      expect(typedResult.item).toBeDefined();
      expect(typedResult.item.externalId).toBe("test-id-123");
      expect(typedResult.item.content).toContain("Content for item test-id-123");
    });

    it("should execute getBulk procedure", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;
          const plugin = yield* pluginRuntime.usePlugin("test-source-plugin", TEST_CONFIG);
          
          const output = yield* pluginRuntime.executePlugin(plugin, TEST_GETBULK_INPUT);
          
          return output;
        })
      );

      expect(result).toBeDefined();
      const typedResult = result as { items: SourceItem[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBe(3);
      expect((typedResult.items[0] as SourceItem).externalId).toBe("id1");
      expect((typedResult.items[1] as SourceItem).externalId).toBe("id2");
      expect((typedResult.items[2] as SourceItem).externalId).toBe("id3");
    });

    it("should execute search procedure", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;
          const plugin = yield* pluginRuntime.usePlugin("test-source-plugin", TEST_CONFIG);
          
          const output = yield* pluginRuntime.executePlugin(plugin, TEST_SEARCH_INPUT);
          
          return output;
        })
      );

      expect(result).toBeDefined();
      const typedResult = result as { items: SourceItem[]; nextState?: string };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBeGreaterThan(0);
      expect((typedResult.items[0] as SourceItem).content).toContain("test query");
      expect(typedResult.nextState).toBeDefined();
    });

    it("should stream getById procedure (single item)", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;

          const stream = yield* pluginRuntime.streamPlugin(
            "test-source-plugin",
            TEST_CONFIG,
            TEST_GETBYID_INPUT,
            {
              maxIterations: 1, // Single execution for getById
            }
          );

          const items = yield* stream.pipe(
            Stream.runCollect
          );

          return Array.from(items);
        })
      );

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect((result[0] as SourceItem).externalId).toBe("test-id-123");
    });

    it("should stream getBulk procedure", async () => {
      const result = await runtime.runPromise(
        Effect.gen(function* () {
          const pluginRuntime = yield* PluginRuntime;

          const stream = yield* pluginRuntime.streamPlugin(
            "test-source-plugin",
            TEST_CONFIG,
            TEST_GETBULK_INPUT,
            {
              maxIterations: 1, // Single execution for getBulk
            }
          );

          const items = yield* stream.pipe(
            Stream.runCollect
          );

          return Array.from(items);
        })
      );

      expect(result).toBeDefined();
      expect(result.length).toBe(3);
      expect(result.map(item => (item as SourceItem).externalId)).toEqual(["id1", "id2", "id3"]);
    });
  });
});
