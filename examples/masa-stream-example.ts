#!/usr/bin/env bun

import { Effect, Logger, LogLevel, Stream } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

// Suppress verbose Effect logging by setting log level to Error only
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

console.log("🚀 Streaming @curatedotfun mentions...\n");

const program = Effect.gen(function* () {
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
        query: "@curatedotfun",
        searchMethod: "searchbyquery",
        sourceType: "twitter",
        maxResults: 25
      },
      state: null
    },
    {
      maxItems: 100
    }
  );

  let count = 0;
  const items = yield* stream.pipe(
    Stream.tap((item: any) => // TODO: we should infer the type from plugin loaded
      Effect.sync(() => {
        count++;
        console.log(`${count}. ${item.externalId}: ${item.content?.substring(0, 80)}...`);
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
  // Suppress Effect's internal logging warnings
  Effect.provide(Logger.minimumLogLevel(LogLevel.Debug))
);

const result = await runtime.runPromise(program);

console.log(`\n✅ Streamed ${Array.isArray(result) ? result.length : 0} items`);
await runtime.dispose();
