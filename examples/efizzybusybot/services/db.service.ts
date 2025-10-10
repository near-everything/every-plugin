import { createClient } from "@libsql/client";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Effect } from "every-plugin/effect";
import {
  entities,
  type Message,
  messages,
  type NewEntity,
  type NewMessage,
  type NewPersona,
  type NewPlatformAccount,
  type NewRelationship,
  type NewStreamState, 
  personas,
  platformAccounts,
  relationships,
  streamState
} from "../schemas/database";
import type { EntityType, PersonaType } from "../schemas/types";

export class DatabaseService extends Effect.Service<DatabaseService>()(
  "DatabaseService",
  {
    effect: Effect.gen(function* () {
      const client = createClient({
        url: process.env.TURSO_CONNECTION_URL || "file:database.db",
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
      const db = drizzle(client);

      yield* Effect.tryPromise({
        try: () => {
          console.log("Migrating database...");
          return migrate(db, {
            migrationsFolder: './drizzle',
          });
        },
        catch: (error) => new Error(`Database migration failed: ${error}`),
      });

      return {
        insertMessage: (message: NewMessage) =>
          Effect.tryPromise({
            try: async () => {
              try {
                const result = await db.insert(messages).values(message).returning({ id: messages.id });
                return result[0]?.id || 0;
              } catch (error: any) {
                if (error.message?.includes('UNIQUE constraint failed')) {
                  return 0;
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

        searchMessagesByEmbedding: (queryEmbedding: Float32Array, limit = 10, chatId?: string) =>
          Effect.tryPromise({
            try: async () => {
              const embeddingBuffer = Buffer.from(queryEmbedding.buffer);

              const sqlQuery = chatId
                ? `
                  SELECT id, external_id, content, content_type, created_at, url, 
                         persona_id, platform_account_id, plugin_id, author_id, author_username, author_display_name,
                         chat_id, message_id, chat_type, is_command, is_reply, has_media,
                         ingested_at, processed, embedding, conversation_thread_id,
                         responded_to, command_type, raw_data,
                         vector_distance_cos(embedding, ?) as distance
                  FROM messages 
                  WHERE chat_id = ? AND embedding IS NOT NULL
                  ORDER BY distance ASC 
                  LIMIT ?
                `
                : `
                  SELECT id, external_id, content, content_type, created_at, url, 
                         persona_id, platform_account_id, plugin_id, author_id, author_username, author_display_name,
                         chat_id, message_id, chat_type, is_command, is_reply, has_media,
                         ingested_at, processed, embedding, conversation_thread_id,
                         responded_to, command_type, raw_data,
                         vector_distance_cos(embedding, ?) as distance
                  FROM messages 
                  WHERE embedding IS NOT NULL
                  ORDER BY distance ASC 
                  LIMIT ?
                `;

              const args = chatId ? [embeddingBuffer, chatId, limit] : [embeddingBuffer, limit];

              const result = await client.execute({ sql: sqlQuery, args });

              return result.rows.map((row: any) => ({
                id: row.id,
                externalId: row.external_id,
                content: row.content,
                contentType: row.content_type,
                createdAt: row.created_at,
                url: row.url,
                personaId: row.persona_id,
                platformAccountId: row.platform_account_id,
                pluginId: row.plugin_id,
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

        insertPersona: (persona: NewPersona) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.insert(personas).values(persona).returning({ id: personas.id });
              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to insert persona: ${error}`)
          }),

        getPersonaById: (id: number) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(personas).where(eq(personas.id, id)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get persona: ${error}`)
          }),

        getPersonaByNearAccount: (nearAccount: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(personas).where(eq(personas.nearAccount, nearAccount)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get persona by NEAR account: ${error}`)
          }),

        getAllPersonas: () =>
          Effect.tryPromise({
            try: async () => {
              return await db.select().from(personas);
            },
            catch: (error) => new Error(`Failed to get all personas: ${error}`)
          }),

        updatePersonaLastActive: (id: number) =>
          Effect.tryPromise({
            try: async () => {
              await db.update(personas)
                .set({ lastActiveAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(personas.id, id));
            },
            catch: (error) => new Error(`Failed to update persona last active: ${error}`)
          }),

        findOrCreatePersona: (displayName: string, nearAccount?: string, personaType: PersonaType = 'human') =>
          Effect.tryPromise({
            try: async () => {
              if (nearAccount) {
                const existing = await db.select().from(personas).where(eq(personas.nearAccount, nearAccount)).limit(1);
                if (existing[0]) return existing[0].id;
              }

              const result = await db.insert(personas).values({
                displayName,
                nearAccount: nearAccount || null,
                personaType,
              }).returning({ id: personas.id });

              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to find or create persona: ${error}`)
          }),

        insertPlatformAccount: (account: NewPlatformAccount) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.insert(platformAccounts).values(account).returning({ id: platformAccounts.id });
              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to insert platform account: ${error}`)
          }),

        getPlatformAccount: (pluginId: string, platformUserId: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(platformAccounts)
                .where(sql`${platformAccounts.pluginId} = ${pluginId} AND ${platformAccounts.platformUserId} = ${platformUserId}`)
                .limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get platform account: ${error}`)
          }),

        linkPlatformAccountToPersona: (accountId: number, personaId: number) =>
          Effect.tryPromise({
            try: async () => {
              await db.update(platformAccounts)
                .set({ personaId })
                .where(eq(platformAccounts.id, accountId));
            },
            catch: (error) => new Error(`Failed to link platform account to persona: ${error}`)
          }),

        findOrCreatePlatformAccount: (pluginId: string, platformUserId: string, platformUsername?: string, platformDisplayName?: string) =>
          Effect.tryPromise({
            try: async () => {
              const existing = await db.select().from(platformAccounts)
                .where(sql`${platformAccounts.pluginId} = ${pluginId} AND ${platformAccounts.platformUserId} = ${platformUserId}`)
                .limit(1);

              if (existing[0]) return existing[0].id;

              const result = await db.insert(platformAccounts).values({
                pluginId,
                platformUserId,
                platformUsername: platformUsername || null,
                platformDisplayName: platformDisplayName || null,
              }).returning({ id: platformAccounts.id });

              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to find or create platform account: ${error}`)
          }),

        insertEntity: (entity: NewEntity) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.insert(entities).values(entity).returning({ id: entities.id });
              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to insert entity: ${error}`)
          }),

        getEntityById: (id: number) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(entities).where(eq(entities.id, id)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get entity: ${error}`)
          }),

        getEntityByNearAccount: (nearAccount: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.select().from(entities).where(eq(entities.nearAccount, nearAccount)).limit(1);
              return result[0] || null;
            },
            catch: (error) => new Error(`Failed to get entity by NEAR account: ${error}`)
          }),

        getAllEntities: () =>
          Effect.tryPromise({
            try: async () => {
              return await db.select().from(entities);
            },
            catch: (error) => new Error(`Failed to get all entities: ${error}`)
          }),

        findOrCreateEntity: (name: string, nearAccount?: string, entityType: EntityType = 'project') =>
          Effect.tryPromise({
            try: async () => {
              if (nearAccount) {
                const existing = await db.select().from(entities).where(eq(entities.nearAccount, nearAccount)).limit(1);
                if (existing[0]) return existing[0].id;
              }

              const result = await db.insert(entities).values({
                name,
                nearAccount: nearAccount || null,
                entityType,
              }).returning({ id: entities.id });

              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to find or create entity: ${error}`)
          }),

        insertRelationship: (relationship: NewRelationship) =>
          Effect.tryPromise({
            try: async () => {
              const result = await db.insert(relationships).values(relationship).returning({ id: relationships.id });
              return result[0]?.id || 0;
            },
            catch: (error) => new Error(`Failed to insert relationship: ${error}`)
          }),

        getRelationshipsBySubject: (subjectType: string, subjectId: number) =>
          Effect.tryPromise({
            try: async () => {
              return await db.select().from(relationships)
                .where(sql`${relationships.subjectType} = ${subjectType} AND ${relationships.subjectId} = ${subjectId}`);
            },
            catch: (error) => new Error(`Failed to get relationships by subject: ${error}`)
          }),

        getRelationshipsByObject: (objectType: string, objectId: number) =>
          Effect.tryPromise({
            try: async () => {
              return await db.select().from(relationships)
                .where(sql`${relationships.objectType} = ${objectType} AND ${relationships.objectId} = ${objectId}`);
            },
            catch: (error) => new Error(`Failed to get relationships by object: ${error}`)
          }),

        getAllRelationships: () =>
          Effect.tryPromise({
            try: async () => {
              return await db.select().from(relationships);
            },
            catch: (error) => new Error(`Failed to get all relationships: ${error}`)
          }),
      };
    })
  }
) { }
