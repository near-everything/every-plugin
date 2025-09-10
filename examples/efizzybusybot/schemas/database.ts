import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// Items table - adapted for Telegram messages
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  externalId: text("external_id").notNull(), // chat_id-message_id format
  platform: text("platform").notNull().$type<'telegram'>().default('telegram'),
  content: text("content").notNull(),
  contentType: text("content_type"), // 'message', 'photo', 'video', etc.
  
  // Telegram-specific fields
  chatId: text("chat_id").notNull(), // Telegram chat ID
  messageId: integer("message_id").notNull(), // Telegram message ID
  chatType: text("chat_type").$type<'private' | 'group' | 'supergroup' | 'channel'>(),
  chatTitle: text("chat_title"), // Group/channel title
  chatUsername: text("chat_username"), // Group/channel username
  
  // Author information
  originalAuthorId: text("original_author_id"), // Telegram user ID
  originalAuthorUsername: text("original_author_username"), // @username
  originalAuthorDisplayName: text("original_author_display_name"), // First + Last name
  
  // Message metadata
  isCommand: integer("is_command", { mode: "boolean" }).default(false), // Bot command
  isMentioned: integer("is_mentioned", { mode: "boolean" }).default(false), // Bot was mentioned/tagged
  replyToMessageId: integer("reply_to_message_id"), // If replying to another message
  forwardFromUserId: text("forward_from_user_id"), // If forwarded
  
  // Timestamps
  createdAt: text("created_at"), // Original message timestamp
  ingestedAt: text("ingested_at").default(sql`CURRENT_TIMESTAMP`),
  
  // URLs and raw data
  url: text("url"), // Telegram message URL (if available)
  rawData: text("raw_data"), // Full Telegram update JSON
}, (table) => ([
  uniqueIndex("items_external_id_idx").on(table.externalId),
  index("items_chat_id_idx").on(table.chatId),
  index("items_author_username_idx").on(table.originalAuthorUsername),
  index("items_ingested_at_idx").on(table.ingestedAt),
  index("items_chat_type_idx").on(table.chatType),
  index("items_command_idx").on(table.isCommand),
  index("items_mention_idx").on(table.isMentioned),
]));

// Processing queue for bot commands and actions
export const processingQueue = sqliteTable("processing_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  submissionType: text("submission_type").notNull().$type<'submit' | 'command' | 'reaction'>(),
  status: text("status").notNull().$type<'pending' | 'processing' | 'completed' | 'failed'>().default('pending'),
  attempts: integer("attempts").default(0),
  workerId: text("worker_id"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  index("queue_status_idx").on(table.status),
  index("queue_worker_idx").on(table.workerId),
]));

// Stream state for Telegram bot - adapted for Telegram's update_id system
export const streamState = sqliteTable("stream_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phase: text("phase").notNull().$type<'initial' | 'collecting' | 'monitoring'>(),
  lastUpdateId: integer("last_update_id"), // Telegram's update_id for resumption
  totalProcessed: integer("total_processed").default(0),
  nextPollMs: integer("next_poll_ms"),
  chatId: text("chat_id"), // Track specific chat if configured
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Chat metadata table - track chat information
export const chats = sqliteTable("chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull().unique(), // Telegram chat ID
  chatType: text("chat_type").$type<'private' | 'group' | 'supergroup' | 'channel'>().notNull(),
  title: text("title"), // Group/channel title
  username: text("username"), // @username for public groups/channels
  description: text("description"),
  memberCount: integer("member_count"),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  firstSeenAt: text("first_seen_at").default(sql`CURRENT_TIMESTAMP`),
  lastMessageAt: text("last_message_at"),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  uniqueIndex("chats_chat_id_idx").on(table.chatId),
  index("chats_username_idx").on(table.username),
  index("chats_type_idx").on(table.chatType),
]));

// User metadata table - track user information
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(), // Telegram user ID
  username: text("username"), // @username
  firstName: text("first_name"),
  lastName: text("last_name"),
  displayName: text("display_name"), // Computed first + last
  languageCode: text("language_code"),
  isBot: integer("is_bot", { mode: "boolean" }).default(false),
  firstSeenAt: text("first_seen_at").default(sql`CURRENT_TIMESTAMP`),
  lastMessageAt: text("last_message_at"),
  messageCount: integer("message_count").default(0),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  uniqueIndex("users_user_id_idx").on(table.userId),
  index("users_username_idx").on(table.username),
  index("users_bot_idx").on(table.isBot),
]));

// Export types for use in services
export type NewItem = typeof items.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewProcessingQueue = typeof processingQueue.$inferInsert;
export type ProcessingQueue = typeof processingQueue.$inferSelect;
export type NewStreamState = typeof streamState.$inferInsert;
export type StreamState = typeof streamState.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Chat = typeof chats.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
