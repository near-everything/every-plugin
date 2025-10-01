import { createClient } from "@libsql/client";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
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
  getAllMessages: (limit?: number, offset?: number) => Effect.Effect<Message[], Error>;
  getMessagesByChatId: (chatId: string, limit?: number) => Effect.Effect<Message[], Error>;
  getConversationHistory: (chatId: string, limit?: number) => Effect.Effect<Message[], Error>;
  getMessagesByThreadId: (threadId: string, limit?: number) => Effect.Effect<Message[], Error>;
  markMessageProcessed: (id: number) => Effect.Effect<void, Error>;
  markMessageRespondedTo: (id: number) => Effect.Effect<void, Error>;

  // Stream state operations
  saveStreamState: (state: NewStreamState) => Effect.Effect<void, Error>;
  loadStreamState: () => Effect.Effect<StreamState | null, Error>;

  // Vector search operations (Turso native vector search)
  searchMessagesByEmbedding: (chatId: string, queryEmbedding: Float32Array, limit?: number) => Effect.Effect<Message[], Error>;
  updateMessageEmbedding: (id: number, embedding: Float32Array) => Effect.Effect<void, Error>;
  getMessagesWithoutEmbeddings: (limit?: number) => Effect.Effect<Message[], Error>;

  // Legacy keyword search (fallback)
  searchMessagesByKeywords: (chatId: string, keywords: string[], limit?: number) => Effect.Effect<Message[], Error>;
}

export const DatabaseService = Context.GenericTag<DatabaseService>("DatabaseService");

// Database service implementation
export const DatabaseServiceLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    // TODO: Initialize Turso database connection
    // Then set TURSO_CONNECTION_URL and TURSO_AUTH_TOKEN in .env
    const client = createClient({
      url: process.env.TURSO_CONNECTION_URL || "file:database.db", // Fallback for development
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const db = drizzle(client);

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

      getAllMessages: (limit = 1000, offset = 0) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .orderBy(desc(messages.ingestedAt))
              .limit(limit)
              .offset(offset);
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

      getConversationHistory: (chatId: string, limit = 20) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .where(eq(messages.chatId, chatId))
              .orderBy(desc(messages.createdAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get conversation history: ${error}`)
        }),

      getMessagesByThreadId: (threadId: string, limit = 50) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .where(eq(messages.conversationThreadId, threadId))
              .orderBy(desc(messages.createdAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get messages by thread: ${error}`)
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

      markMessageRespondedTo: (id: number) =>
        Effect.tryPromise({
          try: async () => {
            await db.update(messages)
              .set({ respondedTo: true })
              .where(eq(messages.id, id));
          },
          catch: (error) => new Error(`Failed to mark message responded to: ${error}`)
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

      // Vector search operations using Turso's native vector search
      searchMessagesByEmbedding: (chatId: string, queryEmbedding: Float32Array, limit = 10) =>
        Effect.tryPromise({
          try: async () => {
            // Convert Float32Array to Buffer for Turso F32_BLOB
            const embeddingBuffer = Buffer.from(queryEmbedding.buffer);
            
            // Use raw LibSQL client for vector search
            // Note: This requires the messages_embedding_idx vector index to be created
            const result = await client.execute({
              sql: `
                SELECT id, external_id, content, content_type, created_at, url, 
                       author_id, author_username, author_display_name,
                       chat_id, message_id, chat_type, is_command, is_reply, has_media,
                       ingested_at, processed, embedding, conversation_thread_id,
                       responded_to, command_type, raw_data,
                       vector_distance_cos(embedding, ?) as distance
                FROM messages 
                WHERE chat_id = ? AND embedding IS NOT NULL
                ORDER BY distance ASC 
                LIMIT ?
              `,
              args: [embeddingBuffer, chatId, limit]
            });

            return result.rows.map((row: any) => ({
              id: row.id,
              externalId: row.external_id,
              content: row.content,
              contentType: row.content_type,
              createdAt: row.created_at,
              url: row.url,
              authorId: row.author_id,
              authorUsername: row.author_username,
              authorDisplayName: row.author_display_name,
              chatId: row.chat_id,
              messageId: row.message_id,
              chatType: row.chat_type,
              isCommand: Boolean(row.is_command),
              isReply: Boolean(row.is_reply),
              hasMedia: Boolean(row.has_media),
              ingestedAt: row.ingested_at,
              processed: Boolean(row.processed),
              embedding: row.embedding,
              conversationThreadId: row.conversation_thread_id,
              respondedTo: Boolean(row.responded_to),
              commandType: row.command_type,
              rawData: row.raw_data,
            })) as Message[];
          },
          catch: (error) => new Error(`Failed to search messages by embedding: ${error}`)
        }),

      updateMessageEmbedding: (id: number, embedding: Float32Array) =>
        Effect.tryPromise({
          try: async () => {
            // Convert Float32Array to Buffer for Turso F32_BLOB storage
            const embeddingBuffer = Buffer.from(embedding.buffer);
            
            await client.execute({
              sql: "UPDATE messages SET embedding = ? WHERE id = ?",
              args: [embeddingBuffer, id]
            });
          },
          catch: (error) => new Error(`Failed to update message embedding: ${error}`)
        }),

      getMessagesWithoutEmbeddings: (limit = 100) =>
        Effect.tryPromise({
          try: async () => {
            return await db.select()
              .from(messages)
              .where(sql`embedding IS NULL`)
              .orderBy(desc(messages.createdAt))
              .limit(limit);
          },
          catch: (error) => new Error(`Failed to get messages without embeddings: ${error}`)
        }),

      // Legacy keyword search (fallback)
      searchMessagesByKeywords: (chatId: string, keywords: string[], limit = 10) =>
        Effect.tryPromise({
          try: async () => {
            if (keywords.length === 0) {
              return [];
            }

            // Create LIKE conditions for each keyword
            const keywordConditions = keywords.map(keyword => 
              like(messages.content, `%${keyword}%`)
            );

            // Search for messages containing any of the keywords
            const result = await db.select()
              .from(messages)
              .where(
                and(
                  eq(messages.chatId, chatId),
                  or(...keywordConditions)
                )
              )
              .orderBy(desc(messages.createdAt))
              .limit(limit);

            return result;
          },
          catch: (error) => new Error(`Failed to search messages by keywords: ${error}`)
        }),
    };
  })
);
