import type { z } from "zod";
import type {
	executePipelineDataSchema,
	jobDataSchema,
	jobStatusEnum,
	jobStatusSchema,
	jobTypeEnum,
	queueStatusEnum,
	queueStatusSchema,
	sourceQueryDataSchema,
	startWorkflowRunDataSchema,
} from "../schemas/queues";

// Enums
export type QueueStatusType = z.infer<typeof queueStatusEnum>;
export type JobType = z.infer<typeof jobTypeEnum>;
export type JobStatusType = z.infer<typeof jobStatusEnum>;

// Queue Management Types
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;

// Base Job Data Wrapper
export type JobData<T> = {
	workflowId: string;
	workflowRunId?: string;
	data: T;
};

// Specific Job Data Payloads
export type StartWorkflowRunData = z.infer<typeof startWorkflowRunDataSchema>;
export type SourceQueryData = z.infer<typeof sourceQueryDataSchema>;
export type ExecutePipelineData = z.infer<typeof executePipelineDataSchema>;

// Full Job Payload Types
export type StartWorkflowRunJobData = JobData<StartWorkflowRunData>;
export type SourceQueryJobData = JobData<SourceQueryData>;
export type ExecutePipelineJobData = JobData<ExecutePipelineData>;

// Union of all possible job data payloads
export type AllJobData = z.infer<typeof jobDataSchema>;

// Queue Names
export const QUEUE_NAMES = {
	WORKFLOW_RUN: "workflow-run-jobs",
	SOURCE_QUERY: "source-query-jobs",
	PIPELINE_EXECUTION: "pipeline-execution-jobs",
} as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
