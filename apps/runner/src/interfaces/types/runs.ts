import type { z } from "zod";
import type {
	pluginRunSchema,
	pluginRunStatusEnum,
	richPluginRunSchema,
	richWorkflowRunSchema,
	richWorkflowRunSummarySchema,
	sourceItemSchema,
	workflowErrorSchema,
	workflowRunInfoSchema,
	workflowRunSchema,
	workflowRunStatusEnum,
} from "../schemas/runs";

// Enums
export type WorkflowRunStatusType = z.infer<typeof workflowRunStatusEnum>;
export type PluginRunStatusType = z.infer<typeof pluginRunStatusEnum>;

export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type RichWorkflowRun = z.infer<typeof richWorkflowRunSchema>;
export type RichWorkflowRunSummary = z.infer<
	typeof richWorkflowRunSummarySchema
>;
export type SourceItem = z.infer<typeof sourceItemSchema>;
export type PluginRun = z.infer<typeof pluginRunSchema>;
export type RichPluginRun = z.infer<typeof richPluginRunSchema>;
export type WorkflowRunInfo = z.infer<typeof workflowRunInfoSchema>;
export type WorkflowError = z.infer<typeof workflowErrorSchema>;
