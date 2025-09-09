#!/usr/bin/env bun

import { Duration, Effect, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Enhanced streaming example using simple procedures with state-based composition
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

// Enhanced state management for two-phase streaming
interface StreamState {
  phase: 'historical' | 'live';
  searchMethod: 'searchbyfullarchive' | 'searchbyquery';
  cursor?: string;
  lastProcessedId?: string;
  lastProcessedTimestamp?: string;
  totalItems: number;
  jobId?: string;
  errorMessage?: string;
}

// Simple state persistence helpers
const saveState = (state: StreamState) =>
  Effect.sync(() => {
    Bun.write('./stream-state.json', JSON.stringify(state, null, 2));
  });

const loadState = (): Effect.Effect<StreamState | null, never> =>
  Effect.tryPromise(async () => {
    const file = Bun.file('./stream-state.json');
    const exists = await file.exists();
    return exists ? await file.json() : null;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

// Tweet log file helper
const appendToTweetLog = (items: any[]) =>
  Effect.sync(() => {
    if (items.length === 0) return;

    // Sort items chronologically (oldest first for the log)
    const sortedItems = [...items].sort((a, b) => {
      const timeA = new Date(a.metadata?.created_at || 0).getTime();
      const timeB = new Date(b.metadata?.created_at || 0).getTime();
      return timeA - timeB; // Oldest first
    });

    const logEntries = `${sortedItems.map(item => {
      const tweetId = item.externalId || item.id || 'unknown';
      const timestamp = item.metadata?.created_at || 'unknown';
      const username = item.metadata?.username || 'unknown';
      return `${tweetId} ${timestamp} ${username}`;
    }).join('\n')}\n`;

    // Append to tweet log file
    const file = Bun.file('./tweet-log.txt');
    const writer = file.writer();
    writer.write(logEntries);
    writer.end();
  });

const query = "@curatedotfun";

console.log(`🚀 Streaming ${query} mentions using simple procedures...\n`);

// Helper to execute plugin procedures
const executePluginProcedure = (procedure: string, input: any) =>
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    const plugin = yield* pluginRuntime.usePlugin("@curatedotfun/masa-source", {
      variables: { baseUrl: "https://data.masa.ai/api/v1" },
      secrets: { apiKey: "{{MASA_API_KEY}}" }
    });

    return yield* pluginRuntime.executePlugin(plugin, {
      procedure,
      input,
      state: null,
    });
  }).pipe(Effect.provide(runtime));

// Helper to build query with filtering
const buildQuery = (baseQuery: string, state: StreamState): string => {
  if (state.phase === 'live' && state.lastProcessedId) {
    return `${baseQuery} since_id:${state.lastProcessedId}`;
  }
  return baseQuery;
};

// Helper to process and deduplicate items
const processItems = (items: any[], state: StreamState): any[] => {
  if (!state.lastProcessedTimestamp) {
    return items;
  }

  // Filter out items older than or equal to last processed timestamp
  return items.filter(item => {
    const itemTimestamp = item.metadata?.created_at;
    if (!itemTimestamp) return true;
    return new Date(itemTimestamp) > new Date(state.lastProcessedTimestamp!);
  });
};

// Helper to update state after processing items
const updateStateAfterProcessing = (state: StreamState, items: any[]): StreamState => {
  if (items.length === 0) return state;

  // Sort items by timestamp to get the newest
  const sortedItems = [...items].sort((a, b) => {
    const timeA = new Date(a.metadata?.created_at || 0).getTime();
    const timeB = new Date(b.metadata?.created_at || 0).getTime();
    return timeB - timeA; // Newest first
  });

  const newestItem = sortedItems[0];

  return {
    ...state,
    lastProcessedId: newestItem.id,
    lastProcessedTimestamp: newestItem.metadata?.created_at,
    totalItems: state.totalItems + items.length
  };
};

// Two-phase streaming logic
const createMasaStream = (initialState: StreamState | null) =>
  Stream.async<any, Error>((emit) => {
    let currentState: StreamState = initialState || {
      phase: 'historical',
      searchMethod: 'searchbyfullarchive',
      totalItems: 0
    };

    const processPhase = async () => {
      try {
        console.log(`📊 ${currentState.phase.toUpperCase()} PHASE: Processing with ${currentState.searchMethod} (${currentState.totalItems} items total)`);

        const searchQuery = buildQuery(query, currentState);
        console.log(`🔍 Query: "${searchQuery}"`);

        // Submit search job
        const jobResult = await Effect.runPromise(
          executePluginProcedure('submitSearchJob', {
            sourceType: 'twitter',
            searchMethod: currentState.searchMethod,
            query: searchQuery,
            maxResults: currentState.phase === 'historical' ? 500 : 100,
            nextCursor: currentState.cursor
          })
        ) as { jobId: string };

        currentState.jobId = jobResult.jobId;
        
        // Save state after getting job ID
        await Effect.runPromise(saveState(currentState));
        
        // Poll for completion with longer intervals
        let jobStatus = 'submitted';
        let pollCount = 0;
        while (jobStatus !== 'done' && jobStatus !== 'error') {
          // Progressive backoff: start with 5 seconds, increase to 15 seconds for longer jobs
          const waitTime = pollCount < 3 ? 5 : pollCount < 10 ? 10 : 15;
          await Effect.runPromise(Effect.sleep(Duration.seconds(waitTime)));
          
          const statusResult = await Effect.runPromise(
            executePluginProcedure('checkJobStatus', {
              jobId: currentState.jobId
            })
          ) as { status: string };
          
          jobStatus = statusResult.status;
          pollCount++;
          console.log(`⏳ Job status: ${jobStatus} (poll #${pollCount}, waited ${waitTime}s)`);
          
          // Save state periodically during polling
          if (pollCount % 5 === 0) {
            await Effect.runPromise(saveState(currentState));
          }
        }

        if (jobStatus === 'error') {
          throw new Error('Job processing failed');
        }

        // Get results
        const resultsResponse = await Effect.runPromise(
          executePluginProcedure('getJobResults', {
            jobId: currentState.jobId
          })
        ) as { items: any[], nextCursor?: string };

        let items = resultsResponse.items || [];
        const nextCursor = resultsResponse.nextCursor;
        console.log(`📥 Retrieved ${items.length} raw items${nextCursor ? ' (has next cursor)' : ' (no next cursor)'}`);

        // Process and deduplicate items
        items = processItems(items, currentState);
        console.log(`✅ Processing ${items.length} new items`);

        // Write to tweet log file
        if (items.length > 0) {
          await Effect.runPromise(appendToTweetLog(items));
        }

        // Emit items to stream
        for (const item of items) {
          emit.single(item);
        }

        // Update state
        currentState = updateStateAfterProcessing(currentState, items);

        // Update cursor for pagination
        if (nextCursor) {
          currentState.cursor = nextCursor;
        }

        // Save state
        await Effect.runPromise(saveState(currentState));

        // Handle phase transitions and pagination
        if (currentState.phase === 'historical') {
          if (!nextCursor || items.length === 0) {
            // No more historical data available, switch to live
            console.log(`🔄 Historical phase complete (no more data). Switching to live monitoring...`);
            currentState.phase = 'live';
            currentState.searchMethod = 'searchbyquery';
            currentState.cursor = undefined;
            return false; // End historical phase
          } else {
            console.log(`📄 Continuing historical pagination with cursor...`);
            return true; // Continue historical pagination
          }
        } else {
          // Live phase - wait 5 minutes before next check
          console.log(`⏰ Live phase complete. Waiting 5 minutes for next check...`);
          await Effect.runPromise(Effect.sleep(Duration.minutes(5)));
          return true; // Continue live monitoring
        }

      } catch (error) {
        console.error(`❌ Phase error:`, error);
        emit.fail(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    };

    const loop = async () => {
      try {
        while (true) {
          const shouldContinue = await processPhase();

          if (!shouldContinue) {
            if (currentState.phase === 'historical') {
              // Historical phase is complete, transition to live
              console.log(`🔄 Transitioning from historical to live phase...`);
              currentState.phase = 'live';
              currentState.searchMethod = 'searchbyquery';
              currentState.cursor = undefined;
              continue;
            } else {
              // Live phase ended unexpectedly, this shouldn't happen
              console.log(`⚠️ Live phase ended unexpectedly, restarting...`);
              continue;
            }
          }

          // Small delay between batches
          await Effect.runPromise(Effect.sleep(Duration.seconds(1)));
        }
      } catch (error) {
        console.error(`❌ Streaming error:`, error);
        emit.fail(error instanceof Error ? error : new Error(String(error)));
      }
    };

    // Start the loop
    loop();
  });

const program = Effect.gen(function* () {
  // Load any previous state for recovery
  const resumeState = yield* loadState();

  if (resumeState) {
    console.log(`📂 Resuming from saved state: ${resumeState.phase} phase (${resumeState.totalItems} items)`);
  }

  // Create stream using simple procedures
  const stream = createMasaStream(resumeState);

  // Process items with minimal logging
  let itemCount = 0;
  const items = yield* stream.pipe(
    Stream.tap((item: any) =>
      Effect.sync(() => {
        itemCount++;
        const tweetId = item.externalId || item.id || 'unknown';
        const username = item.metadata?.username || 'unknown';
        const timestamp = item.metadata?.created_at || 'unknown';
        console.log(`${itemCount}. @${username} (${tweetId}) - ${timestamp}`);
      })
    ),
    Stream.runCollect
  );

  return items;
}).pipe(
  Effect.catchAll((error) => {
    console.error("❌ Streaming Error:", error);
    return Effect.succeed([]);
  }),
  Effect.provide(Logger.minimumLogLevel(LogLevel.Debug)),
  Effect.provide(runtime)
);

const result = await runtime.runPromise(program);

console.log(`\n✅ Streamed ${Array.isArray(result) ? result.length : 0} items using simple procedures`);
console.log(`💾 State saved to ./stream-state.json for recovery`);
await runtime.dispose();
