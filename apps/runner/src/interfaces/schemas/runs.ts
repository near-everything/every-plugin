import { z } from "zod";
import { userSchema } from "./auth";

export const workflowRunStatusValues = [
	"PENDING",
	"RUNNING",
	"COMPLETED",
	"FAILED",
	"PARTIAL_SUCCESS",
	"CANCELLED",
] as const;
export const pluginRunStatusValues = [
	"PENDING",
	"RUNNING",
	"COMPLETED",
	"FAILED",
	"SKIPPED",
	"RETRYING",
] as const;

export const workflowRunStatusEnum = z.enum(workflowRunStatusValues);
export const pluginRunStatusEnum = z.enum(pluginRunStatusValues);

// A single execution instance of a Workflow - includes triggeredBy user as it's always returned by the service
export const workflowRunSchema = z.object({
	id: z.string(),
	workflowId: z.string(),
	status: workflowRunStatusEnum,
	triggeredBy: z.string().nullable(),
	failureReason: z.string().nullable(),
	itemsProcessed: z.number().int(),
	itemsTotal: z.number().int(),
	startedAt: z.coerce.date(),
	completedAt: z.coerce.date().nullable(),
});

// A historical record of a single plugin execution.
export const pluginRunSchema = z.object({
	id: z.string(),
	workflowRunId: z.string(),
	sourceItemId: z.string().nullable(),
	stepId: z.string(),
	pluginId: z.string(),
	type: z.enum(["SOURCE", "PIPELINE"]).default("PIPELINE"),
	config: z.any().nullable(),
	status: pluginRunStatusEnum,
	input: z.any().nullable(),
	output: z.any().nullable(),
	error: z.any().nullable(),
	startedAt: z.coerce.date().nullable(),
	completedAt: z.coerce.date().nullable(),
	retryCount: z.string().default("0"),
});

// A canonical record of a unique piece of data from a source.
export const sourceItemSchema = z.object({
	id: z.string(),
	externalId: z.string(),
	data: z.any(),
	processedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const richWorkflowRunSchema = workflowRunSchema.extend({
	user: userSchema
		.pick({
			id: true,
			name: true,
			image: true,
		})
		.nullable(),
	pluginRuns: z.array(pluginRunSchema),
});

export const richWorkflowRunSummarySchema = workflowRunSchema.extend({
	user: userSchema
		.pick({
			id: true,
			name: true,
			image: true,
		})
		.nullable(),
});

export const richPluginRunSchema = pluginRunSchema.extend({
	sourceItem: sourceItemSchema.nullable(),
	workflowRun: richWorkflowRunSummarySchema.nullable(),
});

// The real-time summary object that lives in Redis.
export const workflowRunInfoSchema = workflowRunSchema.extend({
	currentStep: z.string().optional(),
	errorCount: z.number().int().optional(),
});

// A generic error type for workflows.
export const workflowErrorSchema = z.object({
	workflowId: z.string(),
	error: z.string(),
	timestamp: z.coerce.date(),
	bullmqJobId: z.string().optional(),
	attemptsMade: z.number(),
});

export const CancelWorkflowRunRequestSchema = z.object({
	params: z.object({
		runId: z.string(),
	}),
});

export const DeleteWorkflowRunRequestSchema = z.object({
	params: z.object({
		runId: z.string(),
	}),
});
