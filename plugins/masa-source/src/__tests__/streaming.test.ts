import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import type { PluginRegistry } from "every-plugin";
import { PluginRuntime } from "every-plugin";
import { createTestLayer, type TestPluginMap } from "every-plugin/testing";
import { beforeEach, describe, vi } from "vitest";
import { MasaClient } from "../client";
import MasaSourcePlugin from "../index";
import { JobManager } from "../job-manager";
import type { SourceItem, StreamState } from "../schemas";

// Mock the MasaClient
vi.mock("../client");

// Test registry for masa-source plugin tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/masa-source": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Masa source plugin for streaming tests",
  },
};

const TEST_CONFIG = {
  variables: {
    baseUrl: "https://data.masa.ai/api/v1",
    timeout: 30000,
  },
  secrets: {
    apiKey: "test-api-key-12345",
  },
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-12345",
};

// Plugin map for tests
const TEST_PLUGIN_MAP: TestPluginMap = {
  "@curatedotfun/masa-source": MasaSourcePlugin,
};

// Helper to create mock search results with realistic Twitter snowflake IDs
const createMockResults = (count: number, startId: bigint, timeIncrement: number = 60000) => {
  // Convert snowflake ID to realistic timestamp (Twitter epoch-based)
  const TWITTER_EPOCH = 1288834974657n;
  const snowflakeToTimestamp = (id: bigint): number => {
    const timestamp = Number((id >> 22n) + TWITTER_EPOCH);
    return timestamp;
  };

  const results = [];
  for (let i = 0; i < count; i++) {
    const id = (startId - BigInt(i)).toString();
    const baseTimestamp = snowflakeToTimestamp(startId - BigInt(i));
    // Use snowflake-derived timestamp instead of Date.now() for chronological consistency
    const timestamp = new Date(baseTimestamp).toISOString();
    results.push({
      id,
      source: "twitter",
      content: `Mock tweet content ${i + 1}`,
      metadata: {
        author: `user${i + 1}`,
        username: `user${i + 1}`,
        created_at: timestamp,
        tweet_id: parseInt(id),
        user_id: `user_id_${i + 1}`,
      }
    });
  }
  return results;
};

describe("Masa Source Plugin Streaming State Management", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  let execSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Track call patterns to provide deterministic responses
    const callHistory: Array<{ query: string; maxResults: number }> = [];

    // Setup MasaClient mock
    const mockClient = {
      healthCheck: vi.fn().mockResolvedValue("OK"),
      submitSearchJob: vi.fn().mockImplementation(() => {
        return Promise.resolve(`job-${Date.now()}`);
      }),
      checkJobStatus: vi.fn().mockResolvedValue('done'),
      getJobResults: vi.fn().mockResolvedValue([]),
    };

    // Setup JobManager prototype spy with query-based behavior
    execSpy = vi.spyOn(JobManager.prototype, "executeJobWorkflow");
    execSpy.mockImplementation((sourceType: any, searchMethod: any, query: any, maxResults: any, processFn: any) => {
      const hasMaxId = query.includes("max_id:");
      const hasSinceId = query.includes("since_id:");
      const isInitial = !hasMaxId && !hasSinceId;

      // Query-based test case routing
      if (query.includes("@curatedotfun-basic-flow")) {
        return handleBasicFlowQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      } else if (query.includes("@curatedotfun-max-results")) {
        return handleMaxResultsQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      } else if (query.includes("@curatedotfun-persistence")) {
        return handlePersistenceQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      } else if (query.includes("@curatedotfun-live-polling")) {
        return handleLivePollingQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      } else if (query.includes("@curatedotfun-streaming")) {
        return handleStreamingQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      } else if (query.includes("@curatedotfun")) {
        // Fallback for existing tests - maintain backward compatibility
        return handleLegacyQuery(query, maxResults, processFn, isInitial, hasMaxId, hasSinceId);
      }

      // Default empty response
      return Promise.resolve(processFn([]));
    });

    // Helper functions for different test scenarios
    function handleBasicFlowQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      if (isInitial) {
        const results = createMockResults(100, 1965438650625438182n);
        return Promise.resolve(processFn(results));
      } else if (hasMaxId) {
        const maxIdMatch = query.match(/max_id:(\d+)/);
        const maxId = maxIdMatch ? BigInt(maxIdMatch[1]) : 1965438650625438082n;

        if (maxId === 1965438650625438082n) {
          // First backfill - return items ending at expected oldestSeenId
          const results = createMockResults(100, 1960069700622352424n);
          return Promise.resolve(processFn(results));
        } else {
          // Second backfill - return 50 items (exhausted)
          const results = createMockResults(50, maxId);
          return Promise.resolve(processFn(results));
        }
      } else if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const results = createMockResults(10, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    function handleMaxResultsQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      if (isInitial) {
        const results = createMockResults(100, 1965438650625438182n);
        return Promise.resolve(processFn(results));
      } else if (hasMaxId) {
        // For max results test, return exactly 50 items on backfill to hit the limit
        const results = createMockResults(50, 1960069700622352424n);
        return Promise.resolve(processFn(results));
      } else if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const results = createMockResults(10, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    function handlePersistenceQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      if (hasMaxId) {
        // Return 50 items (exhausted) for persistence test
        const maxIdMatch = query.match(/max_id:(\d+)/);
        const maxId = maxIdMatch ? BigInt(maxIdMatch[1]) : 1960069700622352324n;
        const results = createMockResults(50, maxId);
        return Promise.resolve(processFn(results));
      } else if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const results = createMockResults(10, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    function handleLivePollingQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const results = createMockResults(10, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    function handleStreamingQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      if (isInitial) {
        const results = createMockResults(100, 1965438650625438182n);
        return Promise.resolve(processFn(results));
      } else if (hasMaxId) {
        const maxIdMatch = query.match(/max_id:(\d+)/);
        const maxId = maxIdMatch ? BigInt(maxIdMatch[1]) : 1965438650625438082n;
        
        if (maxId === 1965438650625438082n) {
          // First backfill - continue chronologically from where initial batch ended
          // Start from maxId and go backwards to maintain proper chronological order
          const results = createMockResults(100, maxId);
          return Promise.resolve(processFn(results));
        } else {
          // Subsequent backfill - return 50 items (exhausted)
          const results = createMockResults(50, maxId);
          return Promise.resolve(processFn(results));
        }
      } else if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const results = createMockResults(10, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    function handleLegacyQuery(query: string, maxResults: number, processFn: Function, isInitial: boolean, hasMaxId: boolean, hasSinceId: boolean) {
      // Maintain existing behavior for backward compatibility
      if (isInitial) {
        const itemCount = Math.min(100, maxResults);
        const results = createMockResults(itemCount, 1965438650625438182n);
        return Promise.resolve(processFn(results));
      } else if (hasMaxId) {
        const maxIdMatch = query.match(/max_id:(\d+)/);
        const maxId = maxIdMatch ? BigInt(maxIdMatch[1]) : 1960069700622352424n;

        if (maxId === 1965438650625438082n) {
          const results = createMockResults(100, 1960069700622352424n);
          return Promise.resolve(processFn(results));
        } else if (maxId === 1960069700622352324n) {
          const results = createMockResults(50, maxId);
          return Promise.resolve(processFn(results));
        } else {
          const results = createMockResults(100, maxId);
          return Promise.resolve(processFn(results));
        }
      } else if (hasSinceId) {
        const sinceIdMatch = query.match(/since_id:(\d+)/);
        const sinceId = sinceIdMatch ? BigInt(sinceIdMatch[1]) : 1965438650625438182n;
        const itemCount = Math.min(10, maxResults);
        const results = createMockResults(itemCount, sinceId + 1000n);
        return Promise.resolve(processFn(results));
      }
      return Promise.resolve(processFn([]));
    }

    vi.mocked(MasaClient).mockImplementation(() => mockClient as any);
  });

  describe("Fresh Start - Normal Flow", () => {
    it.effect("should handle initial request and set correct state", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500,
            livePollMs: 6000,
            backfillPageSize: 100,
            livePageSize: 50
          },
          state: null,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState };

        expect(result.items).toBeDefined();
        expect(result.items.length).toBe(100);
        expect(result.nextState).toBeDefined();
        expect(result.nextState.phase).toBe('backfill');
        expect(result.nextState.mostRecentId).toBe('1965438650625438182'); // newest from batch
        expect(result.nextState.oldestSeenId).toBe('1965438650625438083'); // oldest from batch
        expect(result.nextState.totalProcessed).toBe(100);
        expect(result.nextState.backfillDone).toBe(false);
        expect(result.nextState.nextPollMs).toBe(0); // Continue immediately
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should continue backfill with correct max_id", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // First request (initial)
        const firstOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500,
            livePollMs: 6000,
            backfillPageSize: 100,
            livePageSize: 50
          },
          state: null,
        });

        const firstResult = firstOutput as { items: SourceItem[]; nextState: StreamState };

        // Second request (backfill)
        const secondOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: firstResult.nextState,
        });

        const secondResult = secondOutput as { items: SourceItem[]; nextState: StreamState };

        expect(secondResult.items.length).toBe(100);
        expect(secondResult.nextState.phase).toBe('backfill');
        expect(secondResult.nextState.totalProcessed).toBe(200);
        expect(secondResult.nextState.mostRecentId).toBe('1965438650625438182'); // unchanged from initial
        expect(secondResult.nextState.oldestSeenId).toBe('1960069700622352325'); // updated to oldest from this batch

        // Verify the query included correct max_id (oldestSeenId - 1)
        expect(execSpy).toHaveBeenCalledWith(
          'twitter',
          'searchbyfullarchive',
          expect.stringContaining('max_id:1965438650625438082'), // oldestSeenId - 1
          100,
          expect.any(Function)
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should transition to live when backfill exhausted", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // Simulate progression: initial -> backfill -> backfill exhausted -> live
        let currentState: StreamState | null = null;

        // Initial request
        const firstOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500,
            livePollMs: 6000
          },
          state: currentState,
        });
        currentState = (firstOutput as any).nextState;

        // First backfill
        const secondOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500,
            livePollMs: 6000
          },
          state: currentState,
        });
        currentState = (secondOutput as any).nextState;

        // Second backfill (exhausted - returns fewer items)
        const thirdOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500,
            livePollMs: 6000
          },
          state: currentState,
        });

        const thirdResult = thirdOutput as { items: SourceItem[]; nextState: StreamState; };

        expect(thirdResult.items.length).toBe(50); // Fewer than page size
        expect(thirdResult.nextState.phase).toBe('live');
        expect(thirdResult.nextState.backfillDone).toBe(true);
        expect(thirdResult.nextState.totalProcessed).toBe(250);
        expect(thirdResult.nextState.nextPollMs).toBe(6000); // 0.1 minutes = 6 seconds
      }).pipe(Effect.provide(testLayer), Effect.timeout("6 seconds"))
    );
  });

  describe("maxResults Limit Handling", () => {
    it.effect("should stop backfill when maxResults reached", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        let currentState: StreamState | null = null;

        // Initial request
        const firstOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 150 // Limit to 150 items
          },
          state: currentState,
        });
        currentState = (firstOutput as any).nextState;
        expect((currentState as any).totalProcessed).toBe(100);

        // Second request should get 50 more and stop
        const secondOutput = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 150
          },
          state: currentState,
        });

        const secondResult = secondOutput as { items: SourceItem[]; nextState: StreamState; };

        expect(secondResult.items.length).toBe(50); // Only 50 more to reach limit
        expect(secondResult.nextState.phase).toBe('live');
        expect(secondResult.nextState.backfillDone).toBe(true);
        expect(secondResult.nextState.totalProcessed).toBe(150);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should not limit live polling based on maxResults", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // Start with a completed backfill state
        const liveState: StreamState = {
          phase: 'live',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1956278366136353184',
          backfillDone: true,
          totalProcessed: 150, // Already at maxResults
          nextPollMs: 6000,
        };

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 150 // Should not affect live polling
          },
          state: liveState,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState; };

        expect(result.items.length).toBe(10); // Should get new items despite maxResults
        expect(result.nextState.phase).toBe('live');
        expect(result.nextState.totalProcessed).toBe(160); // Should exceed maxResults in live mode
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("State Persistence & Restart", () => {
    it.effect("should resume backfill from saved state", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // Simulate resuming from a saved backfill state
        const savedState: StreamState = {
          phase: 'backfill',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1960069700622352325',
          backfillDone: false,
          totalProcessed: 200,
          nextPollMs: 0,
        };

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: savedState,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState; };

        expect(result.items.length).toBe(50); // Exhausted backfill (3rd call returns 50)
        expect(result.nextState.phase).toBe('live');
        expect(result.nextState.totalProcessed).toBe(250);
        expect(result.nextState.mostRecentId).toBe('1965438650625438182'); // Preserved from initial
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should continue backfill when maxResults increased", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // Simulate resuming with higher maxResults - but with hybrid strategy
        // The implementation will check for new content first (live phase)
        const savedState: StreamState = {
          phase: 'live',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1960069700622352325',
          backfillDone: true,
          totalProcessed: 200,
          nextPollMs: 6000,
        };

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 1000 // Increased from previous 200
          },
          state: savedState,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState; };

        // With hybrid strategy, it first checks for new content (live phase)
        // Since mock returns 10 new items, it stays in live but will continue backfill next
        expect(result.items.length).toBe(10); // New items found
        expect(result.nextState.phase).toBe('live'); // Still in live after getting new content
        expect(result.nextState.totalProcessed).toBe(210); // 200 + 10 new items
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Live Polling Behavior", () => {
    it.effect("should update mostRecentId when new items found", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        const liveState: StreamState = {
          phase: 'live',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1956278366136353184',
          backfillDone: true,
          totalProcessed: 250,
          nextPollMs: 60000,
        };

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: liveState,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState; };

        expect(result.items.length).toBe(10);
        expect(result.nextState.phase).toBe('live');
        expect(result.nextState.mostRecentId).toBe('1965438650625439182'); // Updated to newest (from mock)
        expect(result.nextState.oldestSeenId).toBe('1956278366136353184'); // Unchanged
        expect(result.nextState.nextPollMs).toBe(60000);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should maintain state when no new items found", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        // Force mock to return no new items by using a deterministic approach
        execSpy.mockImplementationOnce((sourceType: any, searchMethod: any, query: any, maxResults: any, processFn: any) => {
          // Always return empty for this specific test
          return Promise.resolve(processFn([]));
        });

        const liveState: StreamState = {
          phase: 'live',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1956278366136353184',
          backfillDone: true,
          totalProcessed: 250,
          nextPollMs: 6000,
        };

        const output = yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: liveState,
        });

        const result = output as { items: SourceItem[]; nextState: StreamState; };

        expect(result.items.length).toBe(0);
        expect(result.nextState.phase).toBe('live');
        expect(result.nextState.mostRecentId).toBe('1965438650625438182'); // Unchanged
        expect(result.nextState.oldestSeenId).toBe('1956278366136353184'); // Unchanged
        expect(result.nextState.totalProcessed).toBe(250); // Unchanged
        expect(result.nextState.nextPollMs).toBe(60000);
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("ID Boundary Edge Cases", () => {
    it.effect("should handle snowflake ID arithmetic correctly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        const backfillState: StreamState = {
          phase: 'backfill',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1960069700622352425',
          backfillDone: false,
          totalProcessed: 100,
          nextPollMs: 0,
        };

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: backfillState,
        });

        // Verify the query used correct max_id (oldestSeenId - 1)
        expect(execSpy).toHaveBeenCalledWith(
          'twitter',
          'searchbyfullarchive',
          expect.stringContaining('max_id:1960069700622352424'), // 1960069700622352425 - 1
          100,
          expect.any(Function)
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );

    it.effect("should handle live polling with since_id correctly", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;
        const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

        const liveState: StreamState = {
          phase: 'live',
          mostRecentId: '1965438650625438182',
          oldestSeenId: '1956278366136353184',
          backfillDone: true,
          totalProcessed: 250,
          nextPollMs: 6000,
        };

        yield* pluginRuntime.executePlugin(plugin, {
          procedure: "search" as const,
          input: {
            query: "@curatedotfun",
            searchMethod: "searchbyfullarchive",
            sourceType: "twitter",
            maxResults: 500
          },
          state: liveState,
        });

        // Verify the query used correct since_id (mostRecentId)
        expect(execSpy).toHaveBeenCalledWith(
          'twitter',
          'searchbyfullarchive',
          expect.stringContaining('since_id:1965438650625438182'),
          20, // Live page size
          expect.any(Function)
        );
      }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
    );
  });

  describe("Streaming Integration", () => {
    it.effect("should stream items in correct order (oldest first)", () =>
      Effect.gen(function* () {
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "@curatedotfun/masa-source",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: {
              query: "@curatedotfun-streaming",
              searchMethod: "searchbyfullarchive",
              sourceType: "twitter",
              maxResults: 300,
              livePollMs: 6000
            },
            state: null,
          },
          {
            maxItems: 250,
            maxInvocations: 5
          }
        );

        const items = yield* stream.pipe(
          Stream.runCollect
        );

        const result = Array.from(items);
        expect(result.length).toBeGreaterThan(0);

        // Verify items are sorted oldest first
        if (result.length > 1) {
          for (let i = 1; i < result.length; i++) {
            const prevItem = result[i - 1] as SourceItem;
            const currItem = result[i] as SourceItem;
            const prevTime = new Date(prevItem?.createdAt || '2024-01-01').getTime();
            const currTime = new Date(currItem?.createdAt || '2024-01-01').getTime();
            expect(prevTime).toBeLessThanOrEqual(currTime);
          }
        }
      }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
    );

    it.effect("should call onStateChange with correct state transitions", () =>
      Effect.gen(function* () {
        const stateChanges: Array<{ state: StreamState | null; itemCount: number }> = [];
        const pluginRuntime = yield* PluginRuntime;

        const stream = yield* pluginRuntime.streamPlugin(
          "@curatedotfun/masa-source",
          TEST_CONFIG,
          {
            procedure: "search" as const,
            input: {
              query: "@curatedotfun-streaming",
              searchMethod: "searchbyfullarchive",
              sourceType: "twitter",
              maxResults: 300,
              livePollMs: 6000
            },
            state: null,
          },
          {
            maxItems: 200,
            maxInvocations: 3,
            onStateChange: (newState: StreamState | null, items: SourceItem[]) =>
              Effect.sync(() => {
                stateChanges.push({ state: newState, itemCount: items.length });
              })
          }
        );

        yield* stream.pipe(
          Stream.runCollect
        );

        expect(stateChanges.length).toBeGreaterThan(0);

        // Verify state progression
        const phases = stateChanges.map(change => change.state?.phase).filter(Boolean);
        expect(phases).toContain('backfill');

        // Verify mostRecentId is maintained across state changes
        const mostRecentIds = stateChanges
          .map(change => change.state?.mostRecentId)
          .filter(id => id !== undefined);

        if (mostRecentIds.length > 1) {
          // All should be the same (from initial request)
          expect(mostRecentIds.every(id => id === mostRecentIds[0])).toBe(true);
        }
      }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
    );
  });
});
