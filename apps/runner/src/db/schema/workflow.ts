import { relations } from "drizzle-orm";
import {
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	varchar,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { workflowRun } from "./workflow-run";
import { workflowsToSourceItems } from "./workflows-to-source-items";

export const workflowStatusValues = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const workflowStatusEnum = pgEnum(
	"workflow_status",
	workflowStatusValues,
);

// A workflow defines a source to query and a pipeline for the items
export const workflow = pgTable("workflow", {
	id: varchar("id", { length: 255 }).primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	createdBy: text("created_by")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	schedule: varchar("schedule", { length: 255 }), // if null, run immediately
	source: jsonb("source").notNull(),
	pipeline: jsonb("pipeline").notNull(),
	state: jsonb("state"),
	status: workflowStatusEnum("status").notNull().default("ACTIVE"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const workflowRelations = relations(workflow, ({ many, one }) => ({
	user: one(user, {
		fields: [workflow.createdBy],
		references: [user.id],
		relationName: "createdByUser",
	}),
	runs: many(workflowRun),
	items: many(workflowsToSourceItems),
}));

export type WorkflowEntity = typeof workflow.$inferSelect;
export type NewWorkflowEntity = typeof workflow.$inferInsert;
