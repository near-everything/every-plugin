import { z } from "zod";
import { jobStatusSchema, queueStatusSchema } from "./queues";
import { pluginRunSchema, workflowRunInfoSchema } from "./runs";

export const webSocketEventTypeEnum = z.enum([
	"WORKFLOW_RUN_CREATED",
	"WORKFLOW_RUN_STARTED",
	"WORKFLOW_RUN_COMPLETED",
	"WORKFLOW_RUN_FAILED",
	"WORKFLOW_RUN_POLLING",
	"WORKFLOW_RUN_CANCELLED",
	"WORKFLOW_RUN_DELETED",
	"SOURCE_QUERY_STARTED",
	"SOURCE_QUERY_COMPLETED",
	"SOURCE_QUERY_FAILED",
	"PIPELINE_EXECUTION_STARTED",
	"PIPELINE_EXECUTION_COMPLETED",
	"PIPELINE_EXECUTION_FAILED",
	"PLUGIN_RUN_STARTED",
	"PLUGIN_RUN_COMPLETED",
	"PLUGIN_RUN_FAILED",
	"JOB_CREATED",
	"JOB_UPDATED",
	"JOB_REMOVED",
	"QUEUE_STATUS_UPDATED",
]);

export const webSocketEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("WORKFLOW_RUN_CREATED"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_STARTED"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_COMPLETED"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_FAILED"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_POLLING"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_CANCELLED"),
		data: workflowRunInfoSchema,
	}),
	z.object({
		type: z.literal("WORKFLOW_RUN_DELETED"),
		data: workflowRunInfoSchema,
	}),
	z.object({ type: z.literal("SOURCE_QUERY_STARTED"), data: pluginRunSchema }),
	z.object({
		type: z.literal("SOURCE_QUERY_COMPLETED"),
		data: pluginRunSchema,
	}),
	z.object({ type: z.literal("SOURCE_QUERY_FAILED"), data: pluginRunSchema }),
	z.object({
		type: z.literal("PIPELINE_EXECUTION_STARTED"),
		data: z.object({ workflowRunId: z.string(), sourceItemId: z.string() }),
	}),
	z.object({
		type: z.literal("PIPELINE_EXECUTION_COMPLETED"),
		data: z.object({ workflowRunId: z.string(), sourceItemId: z.string() }),
	}),
	z.object({
		type: z.literal("PIPELINE_EXECUTION_FAILED"),
		data: z.object({
			workflowRunId: z.string(),
			sourceItemId: z.string(),
			error: z.string().optional(),
		}),
	}),
	z.object({ type: z.literal("PLUGIN_RUN_STARTED"), data: pluginRunSchema }),
	z.object({ type: z.literal("PLUGIN_RUN_COMPLETED"), data: pluginRunSchema }),
	z.object({ type: z.literal("PLUGIN_RUN_FAILED"), data: pluginRunSchema }),
	z.object({ type: z.literal("JOB_CREATED"), data: jobStatusSchema }),
	z.object({ type: z.literal("JOB_UPDATED"), data: jobStatusSchema }),
	z.object({
		type: z.literal("JOB_REMOVED"),
		data: z.object({ jobId: z.string(), queueName: z.string() }),
	}),
	z.object({
		type: z.literal("QUEUE_STATUS_UPDATED"),
		data: z.array(queueStatusSchema),
	}),
]);
