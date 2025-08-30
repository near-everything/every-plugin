import { z } from "zod";

// ============================================================================
// QUEUE MANAGEMENT ENUMS
// ============================================================================

export const jobTypeEnum = z.enum(["completed", "failed", "all"]);

export const jobStatusEnum = z.enum([
	"active",
	"waiting",
	"completed",
	"failed",
	"delayed",
	"paused",
]);

export const queueStatusEnum = z.enum(["active", "paused"]);

export const workflowTypeEnum = z.enum(["completed", "failed", "all"]);

// ============================================================================
// QUEUE MANAGEMENT SCHEMAS
// ============================================================================

// Schema for the status of a single queue.
export const queueStatusSchema = z.object({
	name: z.string(),
	waiting: z.number().int(),
	active: z.number().int(),
	completed: z.number().int(),
	failed: z.number().int(),
	delayed: z.number().int(),
	paused: z.boolean(),
});

// Base schema for all job data, ensuring essential tracking IDs are present.
export const baseJobDataSchema = z.object({
	workflowId: z.string(),
	workflowRunId: z.string().optional(),
});

/**
 * Creates a job data schema by extending the base schema with a specific data schema.
 * This is used to ensure all jobs have the required base properties.
 * @param dataSchema The Zod schema for the job-specific properties.
 * @returns A new Zod schema for the complete job data payload.
 */
export const createJobDataSchema = <T extends z.ZodRawShape>(dataSchema: T) => {
	return baseJobDataSchema.extend(dataSchema);
};

// Specific job data schemas
export const startWorkflowRunDataSchema = z.object({
	triggeredBy: z.string().optional(),
});

export const sourceQueryDataSchema = z.object({
	lastProcessedState: z
		.object({
			data: z.record(z.string(), z.unknown()),
		})
		.optional()
		.nullable(),
});

export const executePipelineDataSchema = z.object({
	sourceItemId: z.string(),
	input: z.record(z.string(), z.unknown()),
	startAtStepId: z.string().optional(),
});

// Schemas for the full job data payload, including the base properties
export const startWorkflowRunJobDataSchema = createJobDataSchema({
	...startWorkflowRunDataSchema.shape,
});

export const sourceQueryJobDataSchema = createJobDataSchema({
	...sourceQueryDataSchema.shape,
});

export const executePipelineJobDataSchema = createJobDataSchema({
	...executePipelineDataSchema.shape,
});

// A discriminated union of all possible job data payloads.
export const jobDataSchema = z.union([
	startWorkflowRunJobDataSchema,
	sourceQueryJobDataSchema,
	executePipelineJobDataSchema,
]);

// Schema for a single job item within a queue (from BullMQ).
export const jobStatusSchema = z.object({
	id: z.string(),
	name: z.string(),
	data: jobDataSchema,
	progress: z.any(),
	attemptsMade: z.number(),
	timestamp: z.number(),
	processedOn: z.number().optional(),
	finishedOn: z.number().optional(),
	failedReason: z.string().optional(),
	returnvalue: z.unknown(),
	queueName: z.string(),
});
