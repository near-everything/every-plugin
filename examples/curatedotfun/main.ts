#!/usr/bin/env bun

import { Effect, Stream, Logger, LogLevel } from "every-plugin/effect";
import { plugins, runtime } from "./runtime";
import type { GopherResult } from "../../plugins/gopher-ai/src/contract";
import type { NewItem } from "./schemas/database";
import { DatabaseService } from "./services/db.service";

// State type for stream persistence
type StreamState = {
  mostRecentId?: string;
  oldestSeenId?: string;
  totalProcessed?: number;
};

// Configuration constants
const BASE_QUERY = "@curatedotfun";

// Helper to extract curator username from content mentioning @curatedotfun
const extractCuratorUsername = (item: GopherResult): string | undefined => {
  // For items mentioning @curatedotfun, the curator is typically the author
  // For Twitter: author_username field comes through catchall
  if (item.content.includes(BASE_QUERY)) {
    return item.author_username;
  }
  return undefined;
};

// Helper to detect !submit commands in content
const detectSubmissionCommands = (content: string): boolean => {
  return content.toLowerCase().includes("!submit");
}

const convertToDbItem = (item: GopherResult): NewItem => {
  return {
    externalId: item.id,
    platform: item.source,
    content: item.content,
    contentType: "text", // Default, since this isn't in the base schema
    conversationId: item.conversation_id || item.metadata?.conversation_id, // Access via catchall
    originalAuthorUsername: item.author_username, // Access via catchall
    originalAuthorId: item.author_id, // Access via catchall
    curatorUsername: extractCuratorUsername(item),
    createdAt: item.created_at || new Date().toISOString(), // Access via catchall or fallback
    url: item.tweet_url || `https://twitter.com/${item.author_username}/status/${item.id}`, // Construct URL if not available
    rawData: item, // Store the entire raw item
  };
};

// Enhanced item processing with database storage
const processItem = (item: GopherResult, itemNumber: number) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;

    // Convert and insert item into database
    const dbItem = convertToDbItem(item);
    const itemId = yield* db.insertItem(dbItem);

    if (itemId === 0) {
      // Duplicate item, skip processing
      console.log(`${itemNumber}. Duplicate item skipped: ${item.id}`);
      return;
    }

    // Check for !submit commands and enqueue for processing
    if (detectSubmissionCommands(item.content)) {
      yield* db.enqueueProcessing(itemId, "submit");
      console.log(`📝 Queued !submit for processing: ${item.id}`);
    }

    // Console output for monitoring
    const tweetId = item.id;
    const timestamp = item.created_at || item.updated_at || new Date().toISOString();
    const username =(item.author_username) || 'unknown';
    const curator = dbItem.curatorUsername ? ` (curator: ${dbItem.curatorUsername})` : '';

    console.log(`${itemNumber}. @${username} (${tweetId}) - ${timestamp}${curator}`);
  });

// State persistence using database
const saveState = (state: StreamState) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    yield* db.saveStreamState({
      mostRecentId: state.mostRecentId,
      oldestSeenId: state.oldestSeenId,
      totalProcessed: state.totalProcessed,
    });
  });

const loadState = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const state = yield* db.loadStreamState();

    if (!state) return null;

    return {
      mostRecentId: state.mostRecentId ?? undefined,
      oldestSeenId: state.oldestSeenId ?? undefined,
      totalProcessed: state.totalProcessed ?? 0,
    };
  });

// Stream creation and processing function
const createAndProcessGopherStream = () =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    const { client } = plugins.gopherAi;

    // Load initial state from database
    const initialState = yield* loadState();

    if (initialState) {
      console.log(`📂 Resuming from saved state (${initialState.totalProcessed || 0} items total)`);
    } else {
      console.log('📂 Starting fresh historical backfill');
    }

    // Create stream
    const streamResult = yield* Effect.promise(() =>
      client.search({
        query: BASE_QUERY,
        sourceType: 'twitter',
        sinceId: initialState?.mostRecentId ?? undefined,
        enableLive: true
      })
    );

    let itemCount = 0;
    let currentMostRecentId = initialState?.mostRecentId;
    let currentOldestSeenId = initialState?.oldestSeenId;

    yield* Stream.fromAsyncIterable(streamResult, (error) => error).pipe(
      Stream.tap((item) =>
        Effect.gen(function* () {
          itemCount++;
          yield* processItem(item, itemCount);

          // Update mostRecentId (for live mode cursor)
          const itemId = BigInt(item.id);
          if (!currentMostRecentId || itemId > BigInt(currentMostRecentId)) {
            currentMostRecentId = item.id;
          }

          // Update oldestSeenId (for backfill cursor)
          if (!currentOldestSeenId || itemId < BigInt(currentOldestSeenId)) {
            currentOldestSeenId = item.id;
          }

          // Periodically save state every 10 items
          if (itemCount % 10 === 0) {
            yield* saveState({
              mostRecentId: currentMostRecentId,
              oldestSeenId: currentOldestSeenId,
              totalProcessed: (initialState?.totalProcessed || 0) + itemCount
            });
            console.log(`💾 State saved (${itemCount} items in this session)`);
          }
        })
      ),
      Stream.runDrain
    );

    // Save final state before shutdown
    yield* saveState({
      mostRecentId: currentMostRecentId,
      oldestSeenId: currentOldestSeenId,
      totalProcessed: (initialState?.totalProcessed || 0) + itemCount
    });
    console.log(`\n💾 Final state saved (${itemCount} items processed)`);
  });

// Main program
const program = Effect.gen(function* () {
  console.log('🚀 Starting Twitter streaming with database storage...\n');
  yield* createAndProcessGopherStream();
  yield* Effect.sync(() => runtime.shutdown());
});

// Run the program with database service
await Effect.runPromise(
  program.pipe(
    Effect.provide(DatabaseService.Default),
    Effect.provide(Logger.minimumLogLevel(LogLevel.Info))
  )
);
