import { Database } from "bun:sqlite";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Context, Effect, Layer } from "effect";
import {
  messages,
  streamState,
  type Message,
  type NewMessage,
  type NewStreamState,
  type StreamState
} from "../schemas/database";

// Simplified database service interface
export interface DatabaseService {
  // Message operations
  insertMessage: (message: NewMessage) => Effect.Effect<number, Error>;
  getMessageById: (id: number) => Effect.Effect<Message | null, Error>;
  getAllMessages: (limit?: number) => Effect.Effect<Message[], Error>;
  getMessagesByChatId: (chatId: string, limit?: number) => Effect.Effect<Message[], Error>;
  markMessageProcessed: (id: number) => Effect.Effect<void, Error>;

  // Stream state operations
  saveStreamState: (state: NewStreamState) => Effect.Effect<void, Error>;
  loadStreamState: () => Effect.Effect<StreamState | null, Error>;
}

export const DatabaseService = Context.GenericTag<DatabaseService>("DatabaseService");

// Database service implementation
export const DatabaseServiceLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    // Initialize SQLite database
    const sqlite = new Database("database.db");
    const db = drizzle(sqlite);

    // Run migrations
    migrate(db, { migrationsFolder: './drizzle' });

    return {
      insertMessage: (message: NewMessage) =>
        Effect.tryPromise({
          try: async () => {
            try {
              const result = await db.insert(messages).values(message).returning({ id: messages.id });
              return result[0]?.id || 0;
            } catch (error: any) {
              // Handle duplicate external_id (unique constraint violation)
              if (error.message?.includes('UNIQUE constraint failed')) {
                return 0; // Indicate duplicate
              }
              throw error;
            }
          },
          catch: (error) => new Error(`Failed to insert message: ${error}`)
        }),

      getMessageById: (id: number) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
            return result[0] || null;
          },
          catch: (error) => new Error(`Failed to get message: ${error}`)
        }),

      getAllMessages: (limit = 1000) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .orderBy(desc(messages.ingestedAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get all messages: ${error}`)
        }),

      getMessagesByChatId: (chatId: string, limit = 100) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .where(eq(messages.chatId, chatId))
              .orderBy(desc(messages.ingestedAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get messages by chat: ${error}`)
        }),

      markMessageProcessed: (id: number) =>
        Effect.tryPromise({
          try: async () => {
            await db.update(messages)
              .set({ processed: true })
              .where(eq(messages.id, id));
          },
          catch: (error) => new Error(`Failed to mark message processed: ${error}`)
        }),

      saveStreamState: (state: NewStreamState) =>
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
            const result = await db.select().from(streamState).limit(1);
            return result[0] || null;
          },
          catch: (error) => new Error(`Failed to load stream state: ${error}`)
        }),
    };
  })
);
