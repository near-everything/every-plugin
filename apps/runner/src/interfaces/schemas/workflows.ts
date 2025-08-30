import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import { userSchema } from "./auth";
import { richWorkflowRunSummarySchema, sourceItemSchema } from "./runs";

export const workflowStatusValues = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export const workflowStatusEnum = z.enum(workflowStatusValues);

// Reusable definition for steps that involve a plugin
export const pluginConfigSchema = z.object({
	pluginId: z.string().min(1, "Plugin ID cannot be empty"),
	config: z.any(),
});

// Pipeline stpe adds a unique 'stepId' to base plugin config
export const pipelineStepDefinitionSchema = pluginConfigSchema.extend({
	stepId: z.string().min(1, "Step ID cannot be empty"),
});

// Source schema
export const sourceSchema = pluginConfigSchema.extend({
	search: z.any(),
});

// Pipeline schema
export const pipelineSchema = z.object({
	steps: z.array(pipelineStepDefinitionSchema),
	env: z
		.object({
			secrets: z.array(z.string()),
		})
		.optional(),
});

// ============================================================================
// WORKFLOW SCHEMAS
// ============================================================================

// Workflow schema
export const workflowSchema = z.object({
	id: z.string(),
	name: z.string(),
	status: workflowStatusEnum,
	schedule: z
		.string()
		.refine(
			(val) => {
				try {
					CronExpressionParser.parse(val);
					return true;
				} catch (e) {
					return false;
				}
			},
			{ message: "Invalid cron expression" },
		)
		.optional()
		.nullable(),
	source: sourceSchema,
	pipeline: pipelineSchema,
	state: z.any().optional().nullable(),
	createdBy: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

// For creating a new workflow (ID and timestamps are generated).
export const createWorkflowSchema = workflowSchema
	.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
		createdBy: true,
	})
	.extend({
		status: workflowStatusEnum.default("INACTIVE"),
	});

// For updating an existing workflow.
export const updateWorkflowSchema = createWorkflowSchema.partial();

// The full workflow object with all its relations for the detailed view.
export const richWorkflowSchema = workflowSchema.extend({
	user: userSchema,
	runs: z.array(richWorkflowRunSummarySchema),
	items: z.array(sourceItemSchema),
});

export const workflowSummarySchema = workflowSchema.pick({
	id: true,
	name: true,
	status: true,
	schedule: true,
	createdAt: true,
	createdBy: true,
});

export const richWorkflowSummarySchema = workflowSummarySchema.extend({
	user: userSchema.pick({
		id: true,
		name: true,
		image: true,
	}),
});
