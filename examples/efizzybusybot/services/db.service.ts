import { Database } from "bun:sqlite";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Context, Effect, Layer } from "effect";
import {
  chats,
  items,
  processingQueue,
  streamState,
  users,
  type Item,
  type NewChat,
  type NewItem,
  type NewStreamState,
  type NewUser,
  type StreamState
} from "../schemas/database";

// Database service interface
export interface DatabaseService {
  // Item operations
  insertItem: (item: NewItem) => Effect.Effect<number, Error>;
  getItemById: (id: number) => Effect.Effect<Item | null, Error>;
  getItemsByChatId: (chatId: string, limit?: number) => Effect.Effect<Item[], Error>;
  getItemsByUsername: (username: string, limit?: number) => Effect.Effect<Item[], Error>;

  // Processing queue operations
  enqueueProcessing: (itemId: number, type: 'submit' | 'command' | 'reaction') => Effect.Effect<void, Error>;

  // Stream state operations
  saveStreamState: (state: NewStreamState) => Effect.Effect<void, Error>;
  loadStreamState: () => Effect.Effect<StreamState | null, Error>;

  // Chat operations
  upsertChat: (chat: NewChat) => Effect.Effect<void, Error>;
  getChatById: (chatId: string) => Effect.Effect<any, Error>;

  // User operations
  upsertUser: (user: NewUser) => Effect.Effect<void, Error>;
  getUserById: (userId: string) => Effect.Effect<any, Error>;
}

export const DatabaseService = Context.GenericTag<DatabaseService>("DatabaseService");

// Database service implementation
export const DatabaseServiceLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    // Initialize SQLite database
    const sqlite = new Database("database.sqlite");
    const db = drizzle(sqlite);

    migrate(db, { migrationsFolder: './drizzle' });

    return {
      insertItem: (item: NewItem) =>
        Effect.tryPromise({
          try: async () => {
            try {
              const result = await db.insert(items).values(item).returning({ id: items.id });
              return result[0]?.id || 0;
            } catch (error: any) {
              // Handle duplicate external_id (unique constraint violation)
              if (error.message?.includes('UNIQUE constraint failed')) {
                return 0; // Indicate duplicate
              }
              throw error;
            }
          },
          catch: (error) => new Error(`Failed to insert item: ${error}`)
        }),

      getItemById: (id: number) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.select().from(items).where(eq(items.id, id)).limit(1);
            return result[0] || null;
          },
          catch: (error) => new Error(`Failed to get item: ${error}`)
        }),

      getItemsByChatId: (chatId: string, limit = 100) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(items)
              .where(eq(items.chatId, chatId))
              .orderBy(desc(items.ingestedAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get items by chat: ${error}`)
        }),

      getItemsByUsername: (username: string, limit = 100) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(items)
              .where(eq(items.originalAuthorUsername, username))
              .orderBy(desc(items.ingestedAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get items by username: ${error}`)
        }),

      enqueueProcessing: (itemId: number, type: 'submit' | 'command' | 'reaction') =>
        Effect.tryPromise({
          try: async () => {
            await db.insert(processingQueue).values({
              itemId,
              submissionType: type,
              status: 'pending'
            });
          },
          catch: (error) => new Error(`Failed to enqueue processing: ${error}`)
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

      upsertChat: (chat: NewChat) =>
        Effect.tryPromise({
          try: async () => {
            // Try to insert, if it fails due to unique constraint, update
            try {
              await db.insert(chats).values(chat);
            } catch (error: any) {
              if (error.message?.includes('UNIQUE constraint failed')) {
                // Update existing chat
                await db.update(chats)
                  .set({
                    title: chat.title,
                    username: chat.username,
                    description: chat.description,
                    memberCount: chat.memberCount,
                    lastMessageAt: chat.lastMessageAt,
                    updatedAt: new Date().toISOString()
                  })
                  .where(eq(chats.chatId, chat.chatId!));
              } else {
                throw error;
              }
            }
          },
          catch: (error) => new Error(`Failed to upsert chat: ${error}`)
        }),

      getChatById: (chatId: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.select().from(chats).where(eq(chats.chatId, chatId)).limit(1);
            return result[0] || null;
          },
          catch: (error) => new Error(`Failed to get chat: ${error}`)
        }),

      upsertUser: (user: NewUser) =>
        Effect.tryPromise({
          try: async () => {
            // Try to insert, if it fails due to unique constraint, update
            try {
              await db.insert(users).values(user);
            } catch (error: any) {
              if (error.message?.includes('UNIQUE constraint failed')) {
                // Update existing user
                await db.update(users)
                  .set({
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    displayName: user.displayName,
                    languageCode: user.languageCode,
                    lastMessageAt: user.lastMessageAt,
                    messageCount: user.messageCount,
                    updatedAt: new Date().toISOString()
                  })
                  .where(eq(users.userId, user.userId!));
              } else {
                throw error;
              }
            }
          },
          catch: (error) => new Error(`Failed to upsert user: ${error}`)
        }),

      getUserById: (userId: string) =>
        Effect.tryPromise({
          try: async () => {
            const result = await db.select().from(users).where(eq(users.userId, userId)).limit(1);
            return result[0] || null;
          },
          catch: (error) => new Error(`Failed to get user: ${error}`)
        }),
    };
  })
);
