#!/usr/bin/env bun

import { Context, Effect, Layer, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";
import type { NewItem } from "./schemas/database";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";

// Configuration constants
const BASE_QUERY = "@curatedotfun";

export const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/masa-source": {
      remoteUrl: "https://elliot-braem-11--curatedotfun-masa-source-every-p-70dcb0f28-ze.zephyrcloud.app/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    MASA_API_KEY: Bun.env.MASA_API_KEY || "your-masa-api-key-here"
  }
});

// MasaPlugin service tag for dependency injection
export class MasaPlugin extends Context.Tag("MasaPlugin")<
  MasaPlugin,
  any // InitializedPlugin type - using any for now to avoid complex typing
>() {}

// Layer that provides the initialized Masa plugin
export const MasaPluginLive = Layer.effect(
  MasaPlugin,
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    // Initialize the plugin once with the configuration
    const initializedPlugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", {
      variables: { baseUrl: "https://data.gopher-ai.com/api/v1" },
      secrets: { apiKey: "{{MASA_API_KEY}}" }
    });
    
    return initializedPlugin;
  })
);

// Helper to extract curator username from content mentioning @curatedotfun
const extractCuratorUsername = (item: any): string | undefined => {
  // For items mentioning @curatedotfun, the curator is typically the author
  if (item.content?.includes("@curatedotfun")) {
    return item.authors?.[0]?.username;
  }
  return undefined;
};

// Helper to detect !submit commands in content
const detectSubmissionCommands = (content: string): boolean => {
  return content.toLowerCase().includes("!submit");
};

// Convert Masa plugin item to database item
const convertToDbItem = (item: any): NewItem => {
  const platform = item.raw?.source === "twitter" ? "twitter" :
    item.raw?.source === "tiktok" ? "tiktok" :
      item.raw?.source === "reddit" ? "reddit" : "twitter"; // default

  return {
    externalId: item.externalId,
    platform,
    content: item.content,
    contentType: item.contentType,
    conversationId: item.raw?.metadata?.conversation_id,
    originalAuthorUsername: item.authors?.[0]?.username,
    originalAuthorId: item.authors?.[0]?.id,
    curatorUsername: extractCuratorUsername(item),
    createdAt: item.createdAt,
    url: item.url,
    rawData: item.raw,
  };
};

// Enhanced item processing with database storage
const processItem = (item: any, itemNumber: number) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    // Convert and insert item into database
    const dbItem = convertToDbItem(item);
    const itemId = yield* db.insertItem(dbItem);

    if (itemId === 0) {
      // Duplicate item, skip processing
      console.log(`${itemNumber}. Duplicate item skipped: ${item.externalId}`);
      return;
    }

    // Check for !submit commands and enqueue for processing
    if (detectSubmissionCommands(item.content)) {
      yield* db.enqueueProcessing(itemId, "submit");
      console.log(`📝 Queued !submit for processing: ${item.externalId}`);
    }

    // Console output for monitoring
    const tweetId = item.externalId || 'unknown';
    const timestamp = item.createdAt || new Date().toISOString();
    const username = item.authors?.[0]?.username || 'unknown';
    const curator = dbItem.curatorUsername ? ` (curator: ${dbItem.curatorUsername})` : '';

    console.log(`${itemNumber}. @${username} (${tweetId}) - ${timestamp}${curator}`);
  });

// State persistence using database
const saveState = (state: any) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    yield* db.saveStreamState({
      phase: state.phase,
      mostRecentId: state.mostRecentId,
      oldestSeenId: state.oldestSeenId,
      backfillDone: state.backfillDone,
      totalProcessed: state.totalProcessed,
      nextPollMs: state.nextPollMs,
    });
  });

const loadState = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const state = yield* db.loadStreamState();

    if (!state) return null;

    // Convert database state back to plugin state format
    return {
      phase: state.phase,
      mostRecentId: state.mostRecentId,
      oldestSeenId: state.oldestSeenId,
      backfillDone: state.backfillDone,
      totalProcessed: state.totalProcessed,
      nextPollMs: state.nextPollMs,
    };
  });

// Main streaming program with database integration
const program = Effect.gen(function* () {
  // Install signal handlers for graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    runtime.runPromise(Effect.gen(function* () {
      const pluginRuntime = yield* PluginRuntime;
      yield* pluginRuntime.shutdown();
    }).pipe(Effect.provide(runtime))).finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('🚀 Starting Masa Twitter streaming with database storage...\n');

  // Load initial state from database
  const initialState = yield* loadState();

  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} items total)`);
  } else {
    console.log('📂 Starting fresh historical backfill');
  }

  // Create streaming pipeline that handles both historical and live phases
  const pluginRuntime = yield* PluginRuntime;
  const masaPlugin = yield* MasaPlugin;

  const stream = yield* pluginRuntime.streamPlugin(
    masaPlugin,
    {
      procedure: "search",
      input: {
        query: BASE_QUERY,
        maxResults: 10000,
        budgetMs: 60000,
        sourceType: 'twitter',
        searchMethod: 'searchbyfullarchive',
      },
      state: initialState,
    },
    {
      maxInvocations: 1000, // High limit for long-running stream
      onStateChange: (newState: any, items: any[]) =>
        Effect.gen(function* () {
          // Log batch info and save state to database
          if (items.length > 0) {
            const phase = newState.phase || 'unknown';
            const emoji = phase === 'initial' ? '🚀' : phase === 'backfill' ? '🏛️' : phase === 'live' ? '🔴' : '📥';
            console.log(`${emoji} Processing ${items.length} items (${newState.totalProcessed || 0} total, phase: ${phase})`);
          } else if (newState.phase === 'live') {
            console.log('⏰ No new items, waiting for next poll...');
          }

          yield* saveState(newState);
        }).pipe(Effect.provide(DatabaseServiceLive))
    }
  );

  // Process each item individually from the stream
  let itemCount = 0;
  yield* stream.pipe(
    Stream.tap((item: any) =>
      Effect.gen(function* () {
        itemCount++;
        yield* processItem(item, itemCount);
      })
    ),
    Stream.runDrain
  );

}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(MasaPluginLive),
  Effect.provide(DatabaseServiceLive),
  Effect.provide(runtime)
);

// Run the program
await runtime.runPromise(program);
