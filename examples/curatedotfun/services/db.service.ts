import { Database } from "bun:sqlite";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Context, Effect, Layer } from "effect";
import { items, processingQueue, streamState, type Item, type NewItem, type NewStreamState, type ProcessingTask, type StreamState } from "../schemas/database";

// Database connection context
export class DatabaseService extends Context.Tag("DatabaseService")<
  DatabaseService,
  {
    readonly insertItem: (item: NewItem) => Effect.Effect<number, Error>;
    readonly getItem: (id: number) => Effect.Effect<Item | null, Error>;
    readonly getItemByExternalId: (externalId: string) => Effect.Effect<Item | null, Error>;
    readonly enqueueProcessing: (itemId: number, submissionType: "submit") => Effect.Effect<void, Error>;
    readonly getNextPendingTask: () => Effect.Effect<ProcessingTask | null, Error>;
    readonly markTaskProcessing: (taskId: number, workerId: string) => Effect.Effect<boolean, Error>;
    readonly markTaskCompleted: (taskId: number) => Effect.Effect<void, Error>;
    readonly markTaskFailed: (taskId: number, errorMessage: string) => Effect.Effect<void, Error>;
    readonly saveStreamState: (state: Omit<NewStreamState, 'id'>) => Effect.Effect<void, Error>;
    readonly loadStreamState: () => Effect.Effect<StreamState | null, Error>;
    readonly getRecentItems: (limit: number) => Effect.Effect<Item[], Error>;
  }
>() { }

// Database implementation
const makeDatabaseService = Effect.gen(function* () {
  // Initialize SQLite database
  const sqlite = new Database("./database.db");
  const db = drizzle(sqlite);

  // Configure SQLite settings (must be done before migrations)
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
  sqlite.exec("PRAGMA cache_size = 1000;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Run migrations (idempotent table creation)
  migrate(db, { migrationsFolder: './drizzle' });

  const insertItem = (item: NewItem) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.insert(items).values({
          ...item,
          rawData: item.rawData ? JSON.stringify(item.rawData) : null,
        }).onConflictDoNothing().returning({ id: items.id });

        return result[0]?.id || 0; // Return 0 if duplicate (no insert)
      },
      catch: (error) => new Error(`Failed to insert item: ${error}`)
    });

  const getItem = (id: number) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select().from(items).where(eq(items.id, id)).limit(1);
        return result[0] || null;
      },
      catch: (error) => new Error(`Failed to get item: ${error}`)
    });

  const getItemByExternalId = (externalId: string) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select().from(items).where(eq(items.externalId, externalId)).limit(1);
        return result[0] || null;
      },
      catch: (error) => new Error(`Failed to get item by external ID: ${error}`)
    });

  const enqueueProcessing = (itemId: number, submissionType: "submit") =>
    Effect.tryPromise({
      try: async () => {
        await db.insert(processingQueue).values({
          itemId,
          submissionType,
        }).onConflictDoNothing();
      },
      catch: (error) => new Error(`Failed to enqueue processing: ${error}`)
    });

  const getNextPendingTask = () =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select()
          .from(processingQueue)
          .where(eq(processingQueue.status, "pending"))
          .orderBy(asc(processingQueue.createdAt))
          .limit(1);
        return result[0] || null;
      },
      catch: (error) => new Error(`Failed to get next pending task: ${error}`)
    });

  const markTaskProcessing = (taskId: number, workerId: string) =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.update(processingQueue)
          .set({
            status: "processing",
            workerId,
            updatedAt: new Date().toISOString()
          })
          .where(and(
            eq(processingQueue.id, taskId),
            eq(processingQueue.status, "pending")
          ));
        return result.changes > 0;
      },
      catch: (error) => new Error(`Failed to mark task processing: ${error}`)
    });

  const markTaskCompleted = (taskId: number) =>
    Effect.tryPromise({
      try: async () => {
        await db.update(processingQueue)
          .set({
            status: "completed",
            updatedAt: new Date().toISOString()
          })
          .where(eq(processingQueue.id, taskId));
      },
      catch: (error) => new Error(`Failed to mark task completed: ${error}`)
    });

  const markTaskFailed = (taskId: number, errorMessage: string) =>
    Effect.tryPromise({
      try: async () => {
        await db.update(processingQueue)
          .set({
            status: "failed",
            errorMessage,
            attempts: sqlite.prepare("SELECT attempts FROM processing_queue WHERE id = ?").get(taskId)?.attempts + 1 || 1,
            updatedAt: new Date().toISOString()
          })
          .where(eq(processingQueue.id, taskId));
      },
      catch: (error) => new Error(`Failed to mark task failed: ${error}`)
    });

  const saveStreamState = (state: Omit<NewStreamState, 'id'>) =>
    Effect.tryPromise({
      try: async () => {
        // Delete existing state and insert new one (simple approach)
        await db.delete(streamState);
        await db.insert(streamState).values(state);
      },
      catch: (error) => new Error(`Failed to save stream state: ${error}`)
    });

  const loadStreamState = () =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select()
          .from(streamState)
          .orderBy(desc(streamState.updatedAt))
          .limit(1);
        return result[0] || null;
      },
      catch: (error) => new Error(`Failed to load stream state: ${error}`)
    });

  const getRecentItems = (limit: number) =>
    Effect.tryPromise({
      try: async () => {
        return await db.select()
          .from(items)
          .orderBy(desc(items.ingestedAt))
          .limit(limit);
      },
      catch: (error) => new Error(`Failed to get recent items: ${error}`)
    });

  return {
    insertItem,
    getItem,
    getItemByExternalId,
    enqueueProcessing,
    getNextPendingTask,
    markTaskProcessing,
    markTaskCompleted,
    markTaskFailed,
    saveStreamState,
    loadStreamState,
    getRecentItems,
  };
});

// Database service layer
export const DatabaseServiceLive = Layer.effect(DatabaseService, makeDatabaseService);
