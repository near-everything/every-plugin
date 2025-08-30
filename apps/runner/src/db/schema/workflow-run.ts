import { relations } from "drizzle-orm";
import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { pluginRun } from "./plugin-run";
import { workflow } from "./workflow";
import { workflowRunsToSourceItems } from "./workflow-runs-to-source-items";

export const workflowRunStatusValues = [
	"PENDING",
	"RUNNING",
	"COMPLETED",
	"FAILED",
	"PARTIAL_SUCCESS",
	"CANCELLED",
] as const;

export const workflowRunStatusEnum = pgEnum(
	"workflow_run_status",
	workflowRunStatusValues,
);

// This is a single execution instance of a workflow.
export const workflowRun = pgTable(
	"workflow_run",
	{
		id: varchar("id", { length: 255 }).primaryKey(), // The runId
		workflowId: varchar("workflow_id", { length: 255 })
			.notNull()
			.references(() => workflow.id, { onDelete: "cascade" }),
		triggeredBy: text("triggered_by").references(() => user.id, {
			onDelete: "set null",
		}),
		status: workflowRunStatusEnum("status").notNull().default("PENDING"),
		failureReason: text("failure_reason"),
		itemsProcessed: integer("items_processed").default(0),
		itemsTotal: integer("items_total").default(0),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		index("workflow_run_workflow_idx").on(table.workflowId),
		index("workflow_run_status_idx").on(table.status),
		index("workflow_run_started_at_idx").on(table.startedAt),
	],
);

export const workflowRunRelations = relations(workflowRun, ({ one, many }) => ({
	workflow: one(workflow, {
		fields: [workflowRun.workflowId],
		references: [workflow.id],
	}),
	user: one(user, {
		fields: [workflowRun.triggeredBy],
		references: [user.id],
		relationName: "triggeredByUser",
	}),
	pluginRuns: many(pluginRun),
	workflowRunsToSourceItems: many(workflowRunsToSourceItems),
}));

export type WorkflowRunEntity = typeof workflowRun.$inferSelect;
export type NewWorkflowRunEntity = typeof workflowRun.$inferInsert;
