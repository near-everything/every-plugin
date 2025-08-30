import {
	type ExecutePipelineJobData,
	QUEUE_NAMES,
	type QueueName,
	type SourceQueryJobData,
	type StartWorkflowRunJobData,
} from "../../interfaces";

export const VALID_QUEUE_NAMES = Object.values(QUEUE_NAMES);

export interface JobDataMapping {
	[QUEUE_NAMES.WORKFLOW_RUN]: StartWorkflowRunJobData;
	[QUEUE_NAMES.PIPELINE_EXECUTION]: ExecutePipelineJobData;
	[QUEUE_NAMES.SOURCE_QUERY]: SourceQueryJobData;
}

export type JobData = JobDataMapping[QueueName];

export { QUEUE_NAMES };
