import { relations } from "drizzle-orm";
import { index, json, pgEnum, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { workflowRun } from "./workflow-run";
import { sourceItem } from "./source-item";

export const pluginRunStatusValues = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'RETRYING'] as const;

export const pluginRunStatusEnum = pgEnum("plugin_run_status", pluginRunStatusValues);
export const pluginRunTypeEnum = pgEnum("plugin_run_type", ["SOURCE", "PIPELINE"]);

export const pluginRun = pgTable("plugin_run", {
  id: varchar("id", { length: 255 }).primaryKey(),
  workflowRunId: varchar("workflow_run_id", { length: 255 })
    .notNull()
    .references(() => workflowRun.id, { onDelete: "cascade" }),
  sourceItemId: varchar("source_item_id", { length: 255 })
    .references(() => sourceItem.id, { onDelete: "cascade" }),
  stepId: varchar("step_id", { length: 255 }).notNull(),
  pluginId: varchar("plugin_id", { length: 255 }).notNull(),
  type: pluginRunTypeEnum("type").notNull().default("PIPELINE"),
  config: json("config"),
  input: json("input"),
  output: json("output"),
  error: json("error"),
  status: pluginRunStatusEnum("status").notNull().default("PENDING"),
  startedAt: timestamp("started_at", { mode: "date", withTimezone: true }),
  completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
  retryCount: varchar("retry_count", { length: 10 }).default("0"),
}, (table) => [
  index("plugin_run_workflow_run_idx").on(table.workflowRunId),
  index("plugin_run_source_item_idx").on(table.sourceItemId),
  index("plugin_run_step_idx").on(table.stepId),
  index("plugin_run_type_idx").on(table.type),
]);

export const pluginRunRelations = relations(pluginRun, ({ one }) => ({
  workflowRun: one(workflowRun, {
    fields: [pluginRun.workflowRunId],
    references: [workflowRun.id],
  }),
  sourceItem: one(sourceItem, {
    fields: [pluginRun.sourceItemId],
    references: [sourceItem.id],
  }),
}));

export type PluginRunEntity = typeof pluginRun.$inferSelect;
export type NewPluginRunEntity = typeof pluginRun.$inferInsert;
