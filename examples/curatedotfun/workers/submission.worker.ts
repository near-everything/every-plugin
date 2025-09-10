#!/usr/bin/env bun

import { Effect, Logger, LogLevel, Schedule, Duration } from "effect";
import { DatabaseService, DatabaseServiceLive } from "../services/db.service";

// Worker ID for tracking which worker is processing tasks
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Process a single submission task
const processSubmissionTask = (task: any) =>
  Effect.gen(function* () {
    const db = yield* DatabaseService;
    
    console.log(`🔄 Processing submission task ${task.id} for item ${task.itemId}`);
    
    // Get the item that contains the !submit
    const item = yield* db.getItem(task.itemId);
    
    if (!item) {
      yield* db.markTaskFailed(task.id, "Item not found");
      return;
    }
    
    console.log(`📝 Found !submit from @${item.originalAuthorUsername}: "${item.content.substring(0, 100)}..."`);
    
    // TODO: Here we would:
    // 1. Parse the !submit command for hashtags and notes
    // 2. Extract the conversation_id to find what they're submitting
    // 3. Use Masa plugin to get the original item and thread
    // 4. Perform analysis based on curator notes and hashtags
    
    // For now, just simulate processing
    yield* Effect.sleep(Duration.seconds(2));
    
    // Mark as completed
    yield* db.markTaskCompleted(task.id);
    console.log(`✅ Completed submission task ${task.id}`);
  });

// Main worker loop
const workerLoop = Effect.gen(function* () {
  const db = yield* DatabaseService;
  
  console.log(`🚀 Starting submission worker ${WORKER_ID}`);
  
  // Continuous processing loop
  yield* Effect.forever(
    Effect.gen(function* () {
      // Get next pending task
      const task = yield* db.getNextPendingTask();
      
      if (!task) {
        // No tasks available, wait before checking again
        yield* Effect.sleep(Duration.seconds(5));
        return;
      }
      
      // Try to claim the task
      const claimed = yield* db.markTaskProcessing(task.id, WORKER_ID);
      
      if (!claimed) {
        // Another worker claimed it, continue
        return;
      }
      
      // Process the task with error handling
      yield* processSubmissionTask(task).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            console.error(`❌ Failed to process task ${task.id}:`, error);
            yield* db.markTaskFailed(task.id, error.message);
          })
        )
      );
    })
  );
});

// Graceful shutdown handler
const setupShutdown = Effect.gen(function* () {
  const shutdown = () => {
    console.log(`\n🛑 Shutting down worker ${WORKER_ID}...`);
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});

// Main program
const program = Effect.gen(function* () {
  yield* setupShutdown;
  yield* workerLoop;
}).pipe(
  Effect.provide(Logger.minimumLogLevel(LogLevel.Info)),
  Effect.provide(DatabaseServiceLive)
);

// Run the worker
await Effect.runPromise(program);
