import { sql } from "drizzle-orm";
import { customType, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Custom embedding type for Turso F32_BLOB with proper dimensions
const embedding = customType<{
  data: number[];
  config: { dimensions: number };
  configRequired: true;
  driverData: Buffer;
}>({
  dataType(config) {
    return `F32_BLOB(${config.dimensions})`;
  },
  fromDriver(value: Buffer) {
    return Array.from(new Float32Array(value.buffer));
  },
  toDriver(value: number[]) {
    return sql`vector32(${JSON.stringify(value)})`;
  },
});

// Simplified messages table that directly maps to TelegramItem
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  
  // Core TelegramItem fields
  externalId: text("external_id").notNull().unique(), // chat_id-message_id format
  content: text("content").notNull(),
  contentType: text("content_type").notNull(), // 'text', 'image', 'video', etc.
  createdAt: text("created_at").notNull(), // Original message timestamp
  url: text("url"), // Telegram message URL
  
  // Author information
  authorId: text("author_id"),
  authorUsername: text("author_username"),
  authorDisplayName: text("author_display_name"),
  
  // Telegram-specific fields
  chatId: text("chat_id").notNull(),
  messageId: integer("message_id").notNull(),
  chatType: text("chat_type").notNull(), // 'private', 'group', 'supergroup', 'channel'
  isCommand: integer("is_command", { mode: "boolean" }).default(false),
  isReply: integer("is_reply", { mode: "boolean" }).default(false),
  hasMedia: integer("has_media", { mode: "boolean" }).default(false),
  
  // Processing metadata
  ingestedAt: text("ingested_at").default(sql`CURRENT_TIMESTAMP`),
  processed: integer("processed", { mode: "boolean" }).default(false),
  
  // Conversation and AI fields
  embedding: embedding("embedding", { dimensions: 384 }), // F32_BLOB for Turso vector search
  conversationThreadId: text("conversation_thread_id"), // Track conversation context
  respondedTo: integer("responded_to", { mode: "boolean" }).default(false),
  commandType: text("command_type"), // Type of command if isCommand=true
  
  // Raw data for debugging/analysis
  rawData: text("raw_data"), // Full TelegramItem JSON
}, (table) => ([
  uniqueIndex("messages_external_id_idx").on(table.externalId),
  index("messages_chat_id_idx").on(table.chatId),
  index("messages_author_id_idx").on(table.authorId),
  index("messages_author_username_idx").on(table.authorUsername),
  index("messages_ingested_at_idx").on(table.ingestedAt),
  index("messages_is_command_idx").on(table.isCommand),
  index("messages_processed_idx").on(table.processed),
  index("messages_conversation_thread_idx").on(table.conversationThreadId),
  index("messages_responded_to_idx").on(table.respondedTo),
  index("messages_command_type_idx").on(table.commandType),
]));

// Simple stream state tracking
export const streamState = sqliteTable("stream_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lastUpdateId: integer("last_update_id"), // Telegram's update_id for resumption
  totalProcessed: integer("total_processed").default(0),
  chatId: text("chat_id"), // Track specific chat if configured
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Export types
export type NewMessage = typeof messages.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewStreamState = typeof streamState.$inferInsert;
export type StreamState = typeof streamState.$inferSelect;
