import { sql } from "drizzle-orm";
import { customType, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

// Core personas table - represents distinct individuals/entities
export const personas = sqliteTable("personas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  displayName: text("display_name").notNull(),
  nearAccount: text("near_account").unique(),
  personaType: text("persona_type").notNull(), // 'human', 'project', 'organization', 'dao'
  bio: text("bio"), // Free text description
  firstSeenAt: text("first_seen_at").default(sql`CURRENT_TIMESTAMP`),
  lastActiveAt: text("last_active_at").default(sql`CURRENT_TIMESTAMP`),
  confidenceScore: real("confidence_score").default(0.5), // 0-1, how sure we are this is a distinct persona
}, (table) => ([
  index("personas_near_account_idx").on(table.nearAccount),
  index("personas_persona_type_idx").on(table.personaType),
  index("personas_display_name_idx").on(table.displayName),
]));

// Platform accounts - links personas to specific platform identities
export const platformAccounts = sqliteTable("platform_accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  personaId: integer("persona_id").references(() => personas.id),
  pluginId: text("plugin_id").notNull(), // e.g., "@curatedotfun/telegram"
  platformUserId: text("platform_user_id").notNull(), // e.g., telegram user_id
  platformUsername: text("platform_username"), // e.g., telegram username
  platformDisplayName: text("platform_display_name"), // e.g., telegram display name
  verified: integer("verified", { mode: "boolean" }).default(false),
  linkedAt: text("linked_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  uniqueIndex("platform_accounts_unique").on(table.pluginId, table.platformUserId),
  index("platform_accounts_persona_id_idx").on(table.personaId),
  index("platform_accounts_plugin_id_idx").on(table.pluginId),
  index("platform_accounts_platform_username_idx").on(table.platformUsername),
]));

// Generic entities (projects, organizations, DAOs, etc.)
export const entities = sqliteTable("entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  nearAccount: text("near_account").unique(),
  entityType: text("entity_type").notNull(), // 'project', 'dao', 'protocol', 'company'
  description: text("description"),
  website: text("website"),
  confidenceScore: real("confidence_score").default(0.5),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  index("entities_name_idx").on(table.name),
  index("entities_near_account_idx").on(table.nearAccount),
  index("entities_entity_type_idx").on(table.entityType),
]));

// Relationships between personas and entities (or persona to persona)
export const relationships = sqliteTable("relationships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  subjectType: text("subject_type").notNull(), // 'persona' or 'entity'
  subjectId: integer("subject_id").notNull(),
  predicate: text("predicate").notNull(), // 'works_on', 'founded', 'collaborates_with', 'member_of', etc.
  objectType: text("object_type").notNull(), // 'persona' or 'entity'
  objectId: integer("object_id").notNull(),
  context: text("context"), // Free text description
  confidenceScore: real("confidence_score").default(0.5),
  sourceMessageId: integer("source_message_id"), // Will reference messages.id after we update messages
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (table) => ([
  index("relationships_subject_idx").on(table.subjectType, table.subjectId),
  index("relationships_object_idx").on(table.objectType, table.objectId),
  index("relationships_predicate_idx").on(table.predicate),
  index("relationships_source_message_idx").on(table.sourceMessageId),
]));

// Updated messages table with persona/platform account links
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  
  // Core message fields
  externalId: text("external_id").notNull().unique(), // chat_id-message_id format
  content: text("content").notNull(),
  contentType: text("content_type").notNull(), // 'text', 'image', 'video', etc.
  createdAt: text("created_at").notNull(), // Original message timestamp
  url: text("url"), // Message URL if available
  
  // Author information - now linked to personas/platform accounts
  personaId: integer("persona_id").references(() => personas.id), // Links to resolved persona
  platformAccountId: integer("platform_account_id").references(() => platformAccounts.id), // Specific platform account
  
  // Legacy author fields (for migration compatibility)
  authorId: text("author_id"), // Keep for backward compatibility during migration
  authorUsername: text("author_username"), // Keep for backward compatibility
  authorDisplayName: text("author_display_name"), // Keep for backward compatibility
  
  // Source context (plugin-agnostic but keeping chatId as requested)
  pluginId: text("plugin_id").notNull(), // Which plugin generated this message
  chatId: text("chat_id").notNull(), // Source chat/channel/room identifier
  messageId: integer("message_id").notNull(), // Platform-specific message ID
  chatType: text("chat_type").notNull(), // 'private', 'group', 'channel', etc.
  
  // Message metadata
  isCommand: integer("is_command", { mode: "boolean" }).default(false),
  isReply: integer("is_reply", { mode: "boolean" }).default(false),
  hasMedia: integer("has_media", { mode: "boolean" }).default(false),
  commandType: text("command_type"), // Type of command if isCommand=true
  
  // Processing metadata
  ingestedAt: text("ingested_at").default(sql`CURRENT_TIMESTAMP`),
  processed: integer("processed", { mode: "boolean" }).default(false),
  respondedTo: integer("responded_to", { mode: "boolean" }).default(false),
  
  // AI fields
  embedding: embedding("embedding", { dimensions: 384 }), // F32_BLOB for Turso vector search
  conversationThreadId: text("conversation_thread_id"), // Track conversation context
  
  // Raw data for debugging/analysis
  rawData: text("raw_data"), // Full platform-specific message JSON
}, (table) => ([
  uniqueIndex("messages_external_id_idx").on(table.externalId),
  index("messages_persona_id_idx").on(table.personaId),
  index("messages_platform_account_id_idx").on(table.platformAccountId),
  index("messages_plugin_id_idx").on(table.pluginId),
  index("messages_chat_id_idx").on(table.chatId),
  index("messages_author_id_idx").on(table.authorId), // Keep for migration
  index("messages_author_username_idx").on(table.authorUsername), // Keep for migration
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
  lastUpdateId: integer("last_update_id"), // Plugin-specific update tracking
  totalProcessed: integer("total_processed").default(0),
  pluginId: text("plugin_id"), // Which plugin this state is for
  chatId: text("chat_id"), // Track specific chat if configured
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Export types
export type NewPersona = typeof personas.$inferInsert;
export type Persona = typeof personas.$inferSelect;
export type NewPlatformAccount = typeof platformAccounts.$inferInsert;
export type PlatformAccount = typeof platformAccounts.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewRelationship = typeof relationships.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewStreamState = typeof streamState.$inferInsert;
export type StreamState = typeof streamState.$inferSelect;
