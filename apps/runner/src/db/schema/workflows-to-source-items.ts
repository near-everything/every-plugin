import { relations } from "drizzle-orm";
import { pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { workflow } from "./workflow";
import { sourceItem } from "./source-item";

export const workflowsToSourceItems = pgTable(
  "workflows_to_source_items",
  {
    workflowId: varchar("workflow_id", { length: 255 })
      .notNull()
      .references(() => workflow.id, { onDelete: "cascade" }),
    sourceItemId: varchar("source_item_id", { length: 255 })
      .notNull()
      .references(() => sourceItem.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workflowId, t.sourceItemId] })]
);

export const workflowsToSourceItemsRelations = relations(
  workflowsToSourceItems,
  ({ one }) => ({
    workflow: one(workflow, {
      fields: [workflowsToSourceItems.workflowId],
      references: [workflow.id],
    }),
    sourceItem: one(sourceItem, {
      fields: [workflowsToSourceItems.sourceItemId],
      references: [sourceItem.id],
    }),
  })
);
