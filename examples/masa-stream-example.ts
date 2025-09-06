#!/usr/bin/env bun

import { Effect, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Enhanced streaming example with state persistence and new API
const runtime = createPluginRuntime({
  registry: {
    "@curatedotfun/masa-source": {
      remoteUrl: "http://localhost:3013/remoteEntry.js",
      type: "source",
      version: "0.0.1"
    }
  },
  secrets: {
    MASA_API_KEY: Bun.env.MASA_API_KEY || "your-masa-api-key-here"
  }
});

// Simple state persistence helpers
const saveState = (state: any) =>
  Effect.sync(() => {
    if (state) {
      Bun.write('./stream-state.json', JSON.stringify(state, null, 2));
    }
  });

const loadState = () =>
  Effect.tryPromise(async () => {
    const file = Bun.file('./stream-state.json');
    const exists = await file.exists();
    return exists ? await file.json() : null;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

const query = "@curatedotfun";

console.log(`🚀 Streaming ${query} mentions...\n`);

const program = Effect.gen(function* () {
  const pluginRuntime = yield* PluginRuntime;

  // Load any previous state for recovery
  const resumeState = yield* loadState();

  if (resumeState) {
    console.log(`📂 Resuming from saved state: ${resumeState.phase || 'unknown'} phase`);
  }

  const stream = yield* pluginRuntime.streamPlugin(
    "@curatedotfun/masa-source",
    {
      variables: { baseUrl: "https://data.masa.ai/api/v1" },
      secrets: { apiKey: "{{MASA_API_KEY}}" }
    },
    {
      procedure: "search",
      input: {
        query: query,
        searchMethod: "searchbyquery",
        sourceType: "twitter",
        maxResults: 25
      },
      state: resumeState // Resume from persisted state
    },
    {
      maxItems: 100,
      // Enhanced: State change hook for persistence and observability
      onStateChange: (newState: any, items: any[]) =>
        Effect.gen(function* () {
          const phase = newState?.phase || 'unknown';
          console.log(`📊 State transition: ${phase} phase (${items.length} items)`);

          // Persist state for recovery
          yield* saveState(newState);
        })
    }
  );

  // Enhanced item processing with better logging
  let totalCount = 0;
  let phaseItems: Record<string, number> = {};

  const items = yield* stream.pipe(
    Stream.tap((item: any) =>
      Effect.sync(() => {
        totalCount++;
        console.log(`${totalCount}. ${item.externalId}: ${item.content?.substring(0, 80)}...`);
      })
    ),
    Stream.runCollect
  );

  return items;
}).pipe(
  Effect.catchAll((error) => {
    console.error("❌ Error:", error);
    return Effect.succeed([]);
  }),
  Effect.provide(Logger.minimumLogLevel(LogLevel.Debug))
);

const result = await runtime.runPromise(program);

console.log(`\n✅ Streamed ${Array.isArray(result) ? result.length : 0} items`);
console.log(`💾 State saved to ./stream-state.json for recovery`);
await runtime.dispose();
