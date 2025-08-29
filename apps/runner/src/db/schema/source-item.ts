import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { workflowsToSourceItems } from "./workflows-to-source-items";
import { workflowRunsToSourceItems } from "./workflow-runs-to-source-items";
import { pluginRun } from "./plugin-run";

export const sourceItem = pgTable("source_item", {
  id: varchar("id", { length: 255 }).primaryKey(),
  externalId: varchar("external_id", { length: 255 }).notNull().unique(),
  data: jsonb("data").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("external_id_idx").on(table.externalId),
  index("source_item_created_at_idx").on(table.createdAt),
  index("source_item_processed_at_idx").on(table.processedAt),
]);

export const sourceItemRelations = relations(sourceItem, ({ many }) => ({
  workflowsToSourceItems: many(workflowsToSourceItems),
  workflowRunsToSourceItems: many(workflowRunsToSourceItems),
  pluginRuns: many(pluginRun),
}));

export type SourceItemEntity = typeof sourceItem.$inferSelect;
export type NewSourceItemEntity = typeof sourceItem.$inferInsert;
