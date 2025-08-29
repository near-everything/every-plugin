import { relations } from "drizzle-orm";
import { pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { workflowRun } from "./workflow-run";
import { sourceItem } from "./source-item";

export const workflowRunsToSourceItems = pgTable(
  "workflow_runs_to_source_items",
  {
    workflowRunId: varchar("workflow_run_id", { length: 255 })
      .notNull()
      .references(() => workflowRun.id, { onDelete: "cascade" }),
    sourceItemId: varchar("source_item_id", { length: 255 })
      .notNull()
      .references(() => sourceItem.id, { onDelete: "cascade" }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workflowRunId, t.sourceItemId] }),
  ]
);

export const workflowRunsToSourceItemsRelations = relations(
  workflowRunsToSourceItems,
  ({ one }) => ({
    workflowRun: one(workflowRun, {
      fields: [workflowRunsToSourceItems.workflowRunId],
      references: [workflowRun.id],
    }),
    sourceItem: one(sourceItem, {
      fields: [workflowRunsToSourceItems.sourceItemId],
      references: [sourceItem.id],
    }),
  })
);
