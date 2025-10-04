import { Database } from "bun:sqlite";
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Effect } from "every-plugin/effect";
import { items, type NewItem, type NewStreamState, processingQueue, streamState } from "../schemas/database";

export class DatabaseService extends Effect.Service<DatabaseService>()(
  "DatabaseService",
  {
    effect: Effect.gen(function* () {
      // Initialize SQLite database
      const sqlite = new Database("./database.db");
      const db = drizzle(sqlite);

      // Configure SQLite settings (must be done before migrations)
      sqlite.exec("PRAGMA journal_mode = WAL;");
      sqlite.exec("PRAGMA synchronous = NORMAL;");
      sqlite.exec("PRAGMA cache_size = 1000;");
      sqlite.exec("PRAGMA foreign_keys = ON;");

      // Run migrations (idempotent table creation)
      yield* Effect.sync(() => migrate(db, { migrationsFolder: './drizzle' }));

      return {
        insertItem: (item: NewItem) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.insert(items).values({
                ...item,
                rawData: item.rawData ? JSON.stringify(item.rawData) : null,
              }).onConflictDoNothing().returning({ id: items.id });

              return result[0]?.id || 0; // Return 0 if duplicate (no insert)
            },
            catch: (error) => new Error(`Failed to insert item: ${error}`)
          }),

        getItem: (id: number) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(items).where(eq(items.id, id)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get item: ${error}`)
          }),

        getItemByExternalId: (externalId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(items).where(eq(items.externalId, externalId)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get item by external ID: ${error}`)
          }),

        enqueueProcessing: (itemId: number, submissionType: "submit") =>
          Effect.tryPromise({
            try: async () => {
              await db.insert(processingQueue).values({
                itemId,
                submissionType,
              }).onConflictDoNothing();
            },
            catch: (error) => new Error(`Failed to enqueue processing: ${error}`)
          }),

        getNextPendingTask: () =>
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
          }),

        markTaskProcessing: (taskId: number, workerId: string) =>
          Effect.tryPromise({
            try: async () => {
              await db.update(processingQueue)
                .set({
                  status: "processing",
                  workerId,
                  updatedAt: new Date().toISOString()
                })
                .where(and(
                  eq(processingQueue.id, taskId),
                  eq(processingQueue.status, "pending")
                ));
              return true;
            },
            catch: (error) => new Error(`Failed to mark task processing: ${error}`)
          }),

        markTaskCompleted: (taskId: number) =>
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
          }),

        markTaskFailed: (taskId: number, errorMessage: string) =>
          Effect.tryPromise({
            try: async () => {
              const existing = await db.select({ attempts: processingQueue.attempts })
                .from(processingQueue)
                .where(eq(processingQueue.id, taskId))
                .limit(1);
              const currentAttempts = existing[0]?.attempts || 0;

              await db.update(processingQueue)
                .set({
                  status: "failed",
                  errorMessage,
                  attempts: currentAttempts + 1,
                  updatedAt: new Date().toISOString()
                })
                .where(eq(processingQueue.id, taskId));
            },
            catch: (error) => new Error(`Failed to mark task failed: ${error}`)
          }),

        saveStreamState: (state: Omit<NewStreamState, 'id'>) =>
          Effect.tryPromise({
            try: async () => {
              // Delete existing state and insert new one (simple approach)
              await db.delete(streamState);
              await db.insert(streamState).values(state);
            },
            catch: (error) => new Error(`Failed to save stream state: ${error}`)
          }),

        loadStreamState: () =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select()
                .from(streamState)
                .orderBy(desc(streamState.updatedAt))
                .limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to load stream state: ${error}`)
          }),

        getRecentItems: (limit: number) =>
          Effect.tryPromise({
            try: async () => {
              return await db.select()
                .from(items)
                .orderBy(desc(items.ingestedAt))
                .limit(limit);
            },
            catch: (error) => new Error(`Failed to get recent items: ${error}`)
          }),
      };
    })
  }
) { }
