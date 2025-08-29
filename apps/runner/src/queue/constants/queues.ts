import {
  type QueueName,
  type StartWorkflowRunJobData,
  type ExecutePipelineJobData,
  type SourceQueryJobData,
  QUEUE_NAMES
} from '@usersdotfun/shared-types/types';

export const VALID_QUEUE_NAMES = Object.values(QUEUE_NAMES);

export interface JobDataMapping {
  [QUEUE_NAMES.WORKFLOW_RUN]: StartWorkflowRunJobData;
  [QUEUE_NAMES.PIPELINE_EXECUTION]: ExecutePipelineJobData;
  [QUEUE_NAMES.SOURCE_QUERY]: SourceQueryJobData;
}

export type JobData = JobDataMapping[QueueName];

export { QUEUE_NAMES };
