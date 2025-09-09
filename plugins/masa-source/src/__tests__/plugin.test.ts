import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import type { PluginRegistry } from "every-plugin";
import { PluginRuntime } from "every-plugin";
import { createTestLayer, type TestPluginMap } from "every-plugin/testing";
import { beforeEach, describe, vi } from "vitest";
import { MasaClient } from "../client";
import { JobManager } from "../job-manager";
import MasaSourcePlugin from "../index";

// Mock the MasaClient and JobManager
vi.mock("../client");
vi.mock("../job-manager");

// Test registry for masa-source plugin tests
const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/masa-source": {
    remoteUrl: "http://localhost:3999/remoteEntry.js",
    type: "source",
    version: "1.0.0",
    description: "Masa source plugin for unit testing",
  },
};

const TEST_CONFIG = {
  variables: {
    baseUrl: "https://data.masa.ai/api/v1",
    timeout: 30000,
    defaultMaxResults: 10,
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

describe("Masa Source Plugin Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  beforeEach(() => {
    vi.clearAllMocks();

    // Track job status calls to simulate progression
    const jobStatusCalls = new Map<string, number>();

    // Setup MasaClient mock - only methods that actually exist
    const mockClient = {
      healthCheck: vi.fn().mockResolvedValue("OK"),
      submitSearchJob: vi.fn().mockImplementation((sourceType, searchMethod, query, maxResults) => {
        return Promise.resolve(`job-${Date.now()}-${query.replace(/\s+/g, '-')}`);
      }),
      checkJobStatus: vi.fn().mockImplementation((jobId) => {
        // Simulate job progression: submitted -> processing -> done
        const callCount = (jobStatusCalls.get(jobId) || 0) + 1;
        jobStatusCalls.set(jobId, callCount);

        // First call: processing, second call: done
        if (callCount === 1) {
          return Promise.resolve('processing');
        } else {
          return Promise.resolve('done');
        }
      }),
      getJobResults: vi.fn().mockImplementation((jobId) => {
        const query = jobId.split('-').slice(2).join('-');

        // Handle different job types based on jobId patterns
        if (jobId.includes('gettrends')) {
          return Promise.resolve([
            {
              id: `trend-${Date.now()}`,
              source: "twitter",
              content: "Trending Topic 1",
              metadata: {
                username: "trending_query",
                likes: 1000,
              }
            },
            {
              id: `trend-${Date.now() + 1}`,
              source: "twitter",
              content: "Trending Topic 2",
              metadata: {
                username: "another_trend",
                likes: 2000,
              }
            }
          ]);
        }

        if (jobId.includes('searchbyprofile')) {
          return Promise.resolve([
            {
              id: `profile-${Date.now()}`,
              source: "twitter",
              content: "Profile content",
              metadata: {
                author: query || "testuser",
                username: query || "testuser",
                user_id: "12345",
                created_at: new Date().toISOString(),
              }
            }
          ]);
        }

        return Promise.resolve([
          {
            id: `result-${Date.now()}`,
            source: "twitter",
            content: `Mock result for ${query}`,
            metadata: {
              author: "mock_user",
              username: "mock_user",
              created_at: new Date().toISOString(),
              tweet_id: 123456789,
            }
          }
        ]);
      }),
      similaritySearch: vi.fn().mockImplementation((options: any) => {
        return Promise.resolve([
          {
            id: `sim-${Date.now()}`,
            source: "twitter",
            content: `Mock similarity result for ${options.query}`,
            metadata: {
              author: "mock_user",
              username: "mock_user",
              created_at: new Date().toISOString(),
              tweet_id: 123456789,
            }
          }
        ]);
      }),
      hybridSearch: vi.fn().mockImplementation((options: any) => {
        return Promise.resolve([
          {
            id: `hybrid-${Date.now()}`,
            source: "twitter",
            content: `Mock hybrid result for ${options.similarity_query.query} + ${options.text_query.query}`,
            metadata: {
              author: "mock_user",
              username: "mock_user",
              created_at: new Date().toISOString(),
              tweet_id: 123456789,
            }
          }
        ]);
      }),
    };

    // Setup JobManager mock - methods that exist on JobManager
    const mockJobManager = {
      getById: vi.fn().mockImplementation((sourceType, id) => {
        return Promise.resolve({
          id: id,
          source: "twitter",
          content: `Mock content for ${id}`,
          metadata: {
            author: "mock_user",
            username: "mock_user",
            created_at: new Date().toISOString(),
            tweet_id: 123456789,
          }
        });
      }),
      getBulk: vi.fn().mockImplementation((sourceType: any, ids: string[]) => {
        return Promise.resolve(ids.map((id: string) => ({
          id: id,
          source: "twitter",
          content: `Mock bulk content for ${id}`,
          metadata: {
            author: "mock_user",
            username: "mock_user",
            created_at: new Date().toISOString(),
            tweet_id: 123456789,
          }
        })));
      }),
      executeJobWorkflow: vi.fn().mockImplementation((sourceType, searchMethod, query, maxResults, processFn) => {
        const mockResults = [
          {
            id: `workflow-${Date.now()}`,
            source: "twitter",
            content: `Mock workflow result for ${query}`,
            metadata: {
              author: query || "mock_user",
              username: query || "mock_user",
              user_id: "12345",
              created_at: new Date().toISOString(),
              tweet_id: 123456789,
            }
          }
        ];
        return Promise.resolve(processFn(mockResults));
      }),
    };

    (MasaClient as any).mockImplementation(() => mockClient);
    (JobManager as any).mockImplementation(() => mockJobManager);
  });

  it.effect("should execute getById procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getById" as const,
        input: { id: "test-id-123", sourceType: "twitter" },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { item: any };
      expect(typedResult.item).toBeDefined();
      expect(typedResult.item.externalId).toBe("test-id-123");
      expect(typedResult.item.content).toContain("test-id-123");
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute getBulk procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getBulk" as const,
        input: { ids: ["id1", "id2", "id3"], sourceType: "twitter" },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBe(3);
      expect(typedResult.items[0].externalId).toBe("id1");
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute search procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "search" as const,
        input: {
          query: "test query",
          searchMethod: "searchbyquery",
          sourceType: "twitter",
          maxResults: 5
        },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[]; nextState?: any };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.nextState).toBeDefined();
      expect(typedResult.nextState.phase).toBe("submitted");
      expect(typedResult.nextState.jobId).toBeDefined();
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute similaritySearch procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "similaritySearch" as const,
        input: {
          query: "test similarity query",
          sources: ["twitter"],
          maxResults: 5
        },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBeGreaterThan(0);
      expect(typedResult.items[0].content).toContain("similarity");
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute hybridSearch procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "hybridSearch" as const,
        input: {
          similarityQuery: { query: "semantic query", weight: 0.6 },
          textQuery: { query: "keyword query", weight: 0.4 },
          sources: ["twitter"],
          maxResults: 5
        },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { items: any[] };
      expect(typedResult.items).toBeDefined();
      expect(Array.isArray(typedResult.items)).toBe(true);
      expect(typedResult.items.length).toBeGreaterThan(0);
      expect(typedResult.items[0].content).toContain("hybrid");
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute getProfile procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getProfile" as const,
        input: { username: "testuser", sourceType: "twitter" },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { profile: any };
      expect(typedResult.profile).toBeDefined();
      expect(typedResult.profile.username).toBe("testuser");
      expect(typedResult.profile.id).toBeDefined();
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should execute getTrends procedure", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      const output = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "getTrends" as const,
        input: { sourceType: "twitter" },
        state: null,
      });

      expect(output).toBeDefined();
      const typedResult = output as { trends: any[] };
      expect(typedResult.trends).toBeDefined();
      expect(Array.isArray(typedResult.trends)).toBe(true);
      expect(typedResult.trends.length).toBeGreaterThan(0);
      expect(typedResult.trends[0].name).toBeDefined();
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

  it.effect("should handle invalid input validation", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      return yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG).pipe(
        Effect.flatMap(plugin =>
          pluginRuntime.executePlugin(plugin, {
            procedure: "search" as const,
            input: {}, // Missing required query field
            state: null,
          })
        ),
        Effect.catchTag("PluginRuntimeError", (error) => {
          expect(error.operation).toBe("validate-input");
          expect(error.retryable).toBe(false);
          expect(error.pluginId).toBe("@curatedotfun/masa-source");
          return Effect.succeed("input-validation-error-handled");
        }),
      );
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );

});

describe("Masa Source Plugin Streaming Tests", () => {
  const testLayer = createTestLayer({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG,
  }, TEST_PLUGIN_MAP);

  it.effect("should stream search results", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "@curatedotfun/masa-source",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: {
            query: "streaming test query",
            searchMethod: "searchbyquery",
            sourceType: "twitter",
            maxResults: 10
          },
          state: null,
        },
        {
          maxItems: 15,
          maxInvocations: 5
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(15);
      expect(result[0]).toHaveProperty('externalId');
      expect(result[0]).toHaveProperty('content');
    }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
  );

  it.effect("should respect maxItems limit in streaming", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "@curatedotfun/masa-source",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: {
            query: "limited streaming test",
            searchMethod: "searchbyquery",
            sourceType: "twitter",
            maxResults: 20
          },
          state: null,
        },
        {
          maxItems: 3,
          maxInvocations: 10
        }
      );

      const items = yield* stream.pipe(
        Stream.runCollect
      );

      const result = Array.from(items);
      expect(result.length).toBeLessThanOrEqual(3);
      expect(result.length).toBeGreaterThan(0);
    }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
  );

  it.effect("should call onStateChange hook during streaming", () =>
    Effect.gen(function* () {
      const stateChanges: Array<{ state: any; itemCount: number }> = [];
      const pluginRuntime = yield* PluginRuntime;

      const stream = yield* pluginRuntime.streamPlugin(
        "@curatedotfun/masa-source",
        TEST_CONFIG,
        {
          procedure: "search" as const,
          input: {
            query: "state change test",
            searchMethod: "searchbyquery",
            sourceType: "twitter",
            maxResults: 5
          },
          state: null,
        },
        {
          maxItems: 10,
          maxInvocations: 3,
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
    }).pipe(Effect.provide(testLayer), Effect.timeout("8 seconds"))
  );

  it.effect("should handle search state transitions", () =>
    Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", TEST_CONFIG);

      // Test initial search submission
      const initialOutput = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "search" as const,
        input: {
          query: "state transition test",
          searchMethod: "searchbyquery",
          sourceType: "twitter",
          maxResults: 5
        },
        state: null,
      });

      const initialResult = initialOutput as { items: any[]; nextState?: any };
      expect(initialResult.nextState).toBeDefined();
      expect(initialResult.nextState.phase).toBe("submitted");
      expect(initialResult.nextState.jobId).toBeDefined();

      // Test processing state
      const processingOutput = yield* pluginRuntime.executePlugin(plugin, {
        procedure: "search" as const,
        input: {
          query: "state transition test",
          searchMethod: "searchbyquery",
          sourceType: "twitter",
          maxResults: 5
        },
        state: initialResult.nextState,
      });

      const processingResult = processingOutput as { items: any[]; nextState?: any };
      expect(processingResult.nextState).toBeDefined();
      expect(["processing", "done"].includes(processingResult.nextState.phase)).toBe(true);
    }).pipe(Effect.provide(testLayer), Effect.timeout("4 seconds"))
  );
});
