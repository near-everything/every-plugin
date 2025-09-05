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


// Test registry with our example source plugin
const TEST_REGISTRY: PluginRegistry = {
  "test-plugin": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
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


  it("should respect maxItems limit", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Start from Phase 3 state that immediately produces items
        const inputWithProductiveState = {
          ...TEST_SEARCH_INPUT,
          state: { phase: "historical", status: "processing", nextPollMs: 10 }
        };

        const stream = yield* pluginRuntime.streamPlugin(
          "test-plugin",
          TEST_CONFIG,
          inputWithProductiveState,
          {
            maxItems: 3, // Strict limit
            maxInvocations: 3
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return Array.from(items);
      })
    );

    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThan(0);
  }, 4000);

  it("should validate invalid state and fail with proper error", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Use invalid state that doesn't match plugin's stateSchema
        const inputWithInvalidState = {
          ...TEST_SEARCH_INPUT,
          state: {
            pageNumber: 10, // Invalid - plugin expects { phase, status?, jobId?, lastId?, nextPollMs? }
            invalidField: "should not be here",
          },
        };

        // The error should occur when creating the stream, not when running it
        return yield* pluginRuntime.streamPlugin(
          "test-plugin",
          TEST_CONFIG,
          inputWithInvalidState,
          {
            stopWhenEmpty: true,
          }
        ).pipe(
          Effect.flatMap(() =>
            // If we get here, validation didn't work
            Effect.succeed("validation-should-have-failed")
          ),
          Effect.catchTag("PluginRuntimeError", (error) => {
            // Should catch state validation error
            expect(error.operation).toBe("validate-state");
            expect(error.retryable).toBe(false);
            expect(error.pluginId).toBe("test-plugin");
            expect(error.cause).toBeDefined();

            console.debug("Caught expected state validation error:", {
              operation: error.operation,
              pluginId: error.pluginId,
              retryable: error.retryable,
              cause: error.cause?.message,
            });

            return Effect.succeed("state-validation-error-handled");
          }),
          Effect.catchAll((unexpectedError: unknown) => {
            console.error("Unexpected error type:", unexpectedError);
            expect.fail(
              `Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`,
            );
            return Effect.succeed("should-not-reach-here");
          }),
        );
      })
    );

    expect(result).toBe("state-validation-error-handled");
  }, 4000);

  it("should handle stopWhenEmpty option", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Use the deterministic "empty" phase that always returns 0 items
        const inputWithEmptyState = {
          ...TEST_SEARCH_INPUT,
          state: {
            phase: "empty",
            nextPollMs: 10,
          },
        };

        const stream = yield* pluginRuntime.streamPlugin(
          "test-plugin",
          TEST_CONFIG,
          inputWithEmptyState,
          {
            stopWhenEmpty: true,
            maxInvocations: 3, // Allow a few iterations to verify it stops
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        return Array.from(items);
      })
    );

    // Should stop immediately when no items are returned from empty phase
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0); // Empty phase always returns 0 items
  }, 4000);

  it("should handle workflow phases correctly", async () => {
    const pluginRuntime = await runtime.runPromise(PluginRuntime);
    const plugin = await runtime.runPromise(pluginRuntime.usePlugin("test-plugin", TEST_CONFIG));

    // Phase 1: null state -> historical job (empty items)
    const phase1 = await runtime.runPromise(
      pluginRuntime.executePlugin(plugin, TEST_SEARCH_INPUT)
    );
    const phase1Result = phase1 as { items: SourceItem[]; nextState: any };
    expect(phase1Result.items).toHaveLength(0);
    expect(phase1Result.nextState.phase).toBe("historical");
    expect(phase1Result.nextState.jobId).toMatch(/^hist_\d+$/);
    expect(phase1Result.nextState.nextPollMs).toBe(10);

    // Phase 2: historical job -> processing (empty items)
    const phase2Input = { ...TEST_SEARCH_INPUT, state: phase1Result.nextState };
    const phase2 = await runtime.runPromise(
      pluginRuntime.executePlugin(plugin, phase2Input)
    );
    const phase2Result = phase2 as { items: SourceItem[]; nextState: any };
    expect(phase2Result.items).toHaveLength(0);
    expect(phase2Result.nextState.phase).toBe("historical");
    expect(phase2Result.nextState.status).toBe("processing");
    expect(phase2Result.nextState.nextPollMs).toBe(10);

    // Phase 3: processing -> historical items + realtime transition
    const phase3Input = { ...TEST_SEARCH_INPUT, state: phase2Result.nextState };
    const phase3 = await runtime.runPromise(
      pluginRuntime.executePlugin(plugin, phase3Input)
    );
    const phase3Result = phase3 as { items: SourceItem[]; nextState: any };
    expect(phase3Result.items.length).toBeGreaterThan(0);
    expect(phase3Result.items[0]?.content).toContain("Historical");
    expect(phase3Result.nextState.phase).toBe("realtime");
    expect(phase3Result.nextState.lastId).toMatch(/^hist_end_\d+$/);
    expect(phase3Result.nextState.nextPollMs).toBe(10);

    // Phase 4: realtime polling (may have items)
    const phase4Input = { ...TEST_SEARCH_INPUT, state: phase3Result.nextState };
    const phase4 = await runtime.runPromise(
      pluginRuntime.executePlugin(plugin, phase4Input)
    );
    const phase4Result = phase4 as { items: SourceItem[]; nextState: any };
    expect(phase4Result.nextState.phase).toBe("realtime");
    // Items may be empty or contain real-time items (random)
    if (phase4Result.items.length > 0) {
      expect(phase4Result.items[0]?.content).toContain("Real-time");
    }
  }, 4000);

  it("should fail when trying to stream non-streamable procedure", async () => {
    const result = await runtime.runPromise(
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        // Try to stream getById which is not streamable (no nextState in output)
        return yield* pluginRuntime.streamPlugin(
          "test-plugin",
          TEST_CONFIG,
          TEST_GETBYID_INPUT
        ).pipe(
          Effect.catchTag("PluginRuntimeError", (error) => {
            expect(error.operation).toBe("stream-plugin-validate");
            expect(error.retryable).toBe(false);
            expect(error.pluginId).toBe("test-plugin");
            expect(error.cause?.message).toContain("not streamable");

            console.debug("Caught expected non-streamable error:", {
              operation: error.operation,
              pluginId: error.pluginId,
              retryable: error.retryable,
              cause: error.cause?.message,
            });

            return Effect.succeed("non-streamable-error-handled");
          }),
          Effect.catchAll((unexpectedError: unknown) => {
            console.error("Unexpected error type:", unexpectedError);
            expect.fail(
              `Expected PluginRuntimeError but got: ${(unexpectedError as { _tag: string })._tag || typeof unexpectedError}`,
            );
            return Effect.succeed("should-not-reach-here");
          }),
        );
      })
    );

    expect(result).toBe("non-streamable-error-handled");
  });
});
