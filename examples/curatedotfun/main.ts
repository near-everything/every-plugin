#!/usr/bin/env bun

import type { PluginBinding } from "every-plugin";
import { Effect, Stream } from "every-plugin/effect";
import { createPluginRuntime } from "every-plugin/runtime";
import type GopherAIPlugin from '../../plugins/gopher-ai/src';
import type { SourceItem } from '../../plugins/gopher-ai/src/schemas';
import type { NewItem } from "./schemas/database";
import { DatabaseService } from "./services/db.service";

// State type for stream persistence
type StreamState = {
  phase: "initial" | "backfill" | "live";
  mostRecentId?: string;
  oldestSeenId?: string;
  backfillDone?: boolean;
  totalProcessed?: number;
  nextPollMs?: number;
};

// Configuration constants
const BASE_QUERY = "@curatedotfun";

// Typed registry bindings using generated types
type IRegistry = {
  "@curatedotfun/gopher-ai": PluginBinding<typeof GopherAIPlugin>
};

export const runtime = createPluginRuntime<IRegistry>({
  registry: {
    "@curatedotfun/gopher-ai": {
      remoteUrl: "http://localhost:3013/remoteEntry.js",
      // https://elliot-braem-81-curatedotfun-gohper-ai-every-plug-e92865b2f-ze.zephyrcloud.app
      type: "source"
    }
  },
  secrets: {
    GOPHERAI_API_KEY: Bun.env.GOPHERAI_API_KEY || "your-masa-api-key-here"
  }
});


// Helper to extract curator username from content mentioning @curatedotfun
const extractCuratorUsername = (item: SourceItem): string | undefined => {
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

const convertToDbItem = (item: SourceItem): NewItem => {
  const raw = item.raw as any;
  const platform = raw?.source === "twitter" ? "twitter" :
    raw?.source === "tiktok" ? "tiktok" :
      raw?.source === "reddit" ? "reddit" : "twitter"; // default

  return {
    externalId: item.externalId,
    platform,
    content: item.content,
    contentType: item.contentType,
    conversationId: raw?.metadata?.conversation_id,
    originalAuthorUsername: item.authors?.[0]?.username,
    originalAuthorId: item.authors?.[0]?.id,
    curatorUsername: extractCuratorUsername(item),
    createdAt: item.createdAt,
    url: item.url,
    rawData: item.raw,
  };
};

// Enhanced item processing with database storage
const processItem = (item: SourceItem, itemNumber: number) =>
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
const saveState = (state: StreamState) =>
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
const main = Effect.gen(function* () {
  console.log('🚀 Starting Twitter streaming with database storage...\n');

  // Get the client directly
  const { client } = yield* Effect.tryPromise(() =>
    runtime.usePlugin("@curatedotfun/gopher-ai", {
      secrets: { apiKey: "{{GOPHERAI_API_KEY}}" },
      variables: { baseUrl: "https://data.gopher-ai.com/api/v1", timeout: 30000 }
    })
  );

  // Load initial state from database
  const initialState = yield* loadState();

  if (initialState) {
    console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} items total)`);
  } else {
    console.log('📂 Starting fresh historical backfill');
  }

  // Get async iterable directly
  const streamResult = yield* Effect.tryPromise(() =>
    client.search({
      query: BASE_QUERY,
      sourceType: 'twitter',
      searchMethod: 'searchbyfullarchive',
      sinceId: initialState?.mostRecentId ?? undefined,
      maxId: initialState?.oldestSeenId ?? undefined,
      enableLive: true,
      maxTotalResults: 10000,
    })
  );

  // Convert to Effect Stream and process
  const stream = Stream.fromAsyncIterable(streamResult, (error) => error);

  let itemCount = 0;
  yield* stream.pipe(
    Stream.tap((item) =>
      Effect.gen(function* () {
        itemCount++;
        yield* processItem(item, itemCount);
      })
    ),
    Stream.runDrain
  );

  yield* Effect.tryPromise(() => runtime.shutdown());
});

// Run the program with database service
await Effect.runPromise(
  main.pipe(Effect.provide(DatabaseService.Default))
);
