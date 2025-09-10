#!/usr/bin/env bun

import { Effect, Logger, LogLevel } from "effect";
import { DatabaseService, DatabaseServiceLive } from "./services/db.service";

// Simple database inspection utility
const inspectDatabase = Effect.gen(function* () {
  const db = yield* DatabaseService;
  
  console.log("📊 Database Inspection\n");
  
  // Get recent items
  const recentItems = yield* db.getRecentItems(10);
  console.log(`📝 Recent Items (${recentItems.length}):`);
  recentItems.forEach((item, i) => {
    const curator = item.curatorUsername ? ` (curator: ${item.curatorUsername})` : '';
    console.log(`  ${i + 1}. @${item.originalAuthorUsername} - ${item.externalId}${curator}`);
    console.log(`     "${item.content.substring(0, 80)}..."`);
    console.log(`     Platform: ${item.platform}, Ingested: ${item.ingestedAt}\n`);
  });
  
  // Get pending tasks
  const pendingTask = yield* db.getNextPendingTask();
  if (pendingTask) {
    console.log("⏳ Next Pending Task:");
    console.log(`   Task ID: ${pendingTask.id}, Item ID: ${pendingTask.itemId}`);
    console.log(`   Type: ${pendingTask.submissionType}, Status: ${pendingTask.status}`);
    console.log(`   Created: ${pendingTask.createdAt}\n`);
  } else {
    console.log("✅ No pending tasks in queue\n");
  }
  
  // Get stream state
  const streamState = yield* db.loadStreamState();
  if (streamState) {
    console.log("🔄 Stream State:");
    console.log(`   Phase: ${streamState.phase}`);
    console.log(`   Total Processed: ${streamState.totalProcessed}`);
    console.log(`   Most Recent ID: ${streamState.mostRecentId}`);
    console.log(`   Oldest Seen ID: ${streamState.oldestSeenId}`);
    console.log(`   Backfill Done: ${streamState.backfillDone}`);
    console.log(`   Next Poll: ${streamState.nextPollMs}ms`);
    console.log(`   Updated: ${streamState.updatedAt}\n`);
  } else {
    console.log("❌ No stream state found\n");
  }
});

// Main program
const program = inspectDatabase.pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseServiceLive)
);

// Run the inspection
await Effect.runPromise(program);
