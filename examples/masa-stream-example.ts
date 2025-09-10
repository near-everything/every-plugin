#!/usr/bin/env bun

import { Duration, Effect, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Configuration constants
const BASE_QUERY = "@curatedotfun";

const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/masa-source": {
      remoteUrl: "http://localhost:3013/remoteEntry.js",
      type: "source"
    }
  },
  secrets: {
    MASA_API_KEY: Bun.env.MASA_API_KEY || "your-masa-api-key-here"
  }
});

// Tweet log helper for individual items
const logTweet = (item: any, itemNumber: number) =>
  Effect.sync(() => {
    const tweetId = item.externalId || 'unknown';
    const timestamp = item.createdAt || new Date().toISOString();
    const username = item.authors?.[0]?.username || 'unknown';
    const logEntry = `${tweetId} ${timestamp} ${username}\n`;
    
    // Append to log file
    const file = Bun.file('./tweet-log.txt');
    const writer = file.writer();
    writer.write(logEntry);
    writer.end();
    
    // Console output
    console.log(`${itemNumber}. @${username} (${tweetId}) - ${timestamp}`);
  });

// State persistence helpers
const saveState = (state: any) =>
  Effect.sync(() => Bun.write('./stream-state.json', JSON.stringify(state, null, 2)));

const loadState = () =>
  Effect.tryPromise(async () => {
    const file = Bun.file('./stream-state.json');
    return (await file.exists()) ? await file.json() : null;
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));

// Main streaming program using the plugin's built-in streaming
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

  console.log('🚀 Starting Masa Twitter streaming...\n');

  // Load initial state or start fresh
  const initialState = (yield* loadState()) ?? null;
  
  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} items total)`);
  } else {
    console.log('📂 Starting fresh historical backfill');
  }

  // Create streaming pipeline that handles both historical and live phases
  const pluginRuntime = yield* PluginRuntime;
  
  const stream = yield* pluginRuntime.streamPlugin(
    "@curatedotfun/masa-source",
    {
      variables: { baseUrl: "https://data.masa.ai/api/v1" },
      secrets: { apiKey: "{{MASA_API_KEY}}" }
    },
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
          // Log batch info and save state
          if (items.length > 0) {
            const phase = newState.phase || 'unknown';
            const emoji = phase === 'initial' ? '🚀' : phase === 'backfill' ? '🏛️' : phase === 'live' ? '🔴' : '📥';
            console.log(`${emoji} Processing ${items.length} items (${newState.totalProcessed || 0} total, phase: ${phase})`);
          } else if (newState.phase === 'live') {
            console.log('⏰ No new items, waiting for next poll...');
          }
          
          yield* saveState(newState);
        })
    }
  );

  // Process each item individually from the stream
  let itemCount = 0;
  yield* stream.pipe(
    Stream.tap((item: any) => 
      Effect.gen(function* () {
        itemCount++;
        yield* logTweet(item, itemCount);
      })
    ),
    Stream.runDrain
  );

}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(runtime)
);

// Run the program
await runtime.runPromise(program);
