import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Main items table - stores all scraped social content
export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull(),
    platform: text("platform", { enum: ["twitter", "tiktok", "reddit", "web"] }).notNull(),
    content: text("content").notNull(),
    contentType: text("content_type"),
    conversationId: text("conversation_id"),
    originalAuthorUsername: text("original_author_username"),
    originalAuthorId: text("original_author_id"),
    curatorUsername: text("curator_username"), // Who mentioned/submitted this
    createdAt: text("created_at"), // When content was posted
    ingestedAt: text("ingested_at").default(sql`CURRENT_TIMESTAMP`),
    url: text("url"),
    rawData: text("raw_data", { mode: "json" }), // Full JSON from Source
  },
  (table) => ([
    // Unique constraint on external_id to prevent duplicates
    uniqueIndex("external_id_idx").on(table.externalId),
    // Index for conversation lookups
    index("conversation_idx").on(table.conversationId),
    // Index for curator lookups
    index("curator_idx").on(table.curatorUsername),
    // Index for ingestion time queries
    index("ingested_at_idx").on(table.ingestedAt),
  ])
);

// Processing queue for items that need analysis (!submit, etc.)
export const processingQueue = sqliteTable(
  "processing_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    submissionType: text("submission_type", { enum: ["submit"] }).notNull(),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"]
    }).default("pending"),
    attempts: integer("attempts").default(0),
    workerId: text("worker_id"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ([
    // Index for status queries
    index("status_idx").on(table.status),
    // Index for worker assignment
    index("worker_idx").on(table.workerId),
  ])
);

// Stream state persistence (replaces JSON file)
export const streamState = sqliteTable("stream_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mostRecentId: text("most_recent_id"),
  oldestSeenId: text("oldest_seen_id"),
  totalProcessed: integer("total_processed").default(0),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Export types for use in services
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type ProcessingTask = typeof processingQueue.$inferSelect;
export type NewProcessingTask = typeof processingQueue.$inferInsert;
export type StreamState = typeof streamState.$inferSelect;
export type NewStreamState = typeof streamState.$inferInsert;
