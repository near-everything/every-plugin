import type { z } from "zod";
import type {
	createWorkflowSchema,
	pipelineSchema,
	pipelineStepDefinitionSchema,
	pluginConfigSchema,
	richWorkflowSchema,
	richWorkflowSummarySchema,
	sourceSchema,
	updateWorkflowSchema,
	workflowSchema,
	workflowStatusEnum,
	workflowSummarySchema,
} from "../schemas/workflows";
import type {
	PluginRun,
	SourceItem,
	WorkflowError,
	WorkflowRun,
	WorkflowRunInfo,
} from "./runs";

export type WorkflowStatusType = z.infer<typeof workflowStatusEnum>;

// Reusable Definition Types
export type PluginConfig = z.infer<typeof pluginConfigSchema>;
export type PipelineStepDefinition = z.infer<
	typeof pipelineStepDefinitionSchema
>;
export type Source = z.infer<typeof sourceSchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;

// Core Domain Types
export type Workflow = z.infer<typeof workflowSchema>;

// API/Service Layer Types
export type CreateWorkflow = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflow = z.infer<typeof updateWorkflowSchema>;

// Extended Types
export type RichWorkflow = z.infer<typeof richWorkflowSchema>;
export type WorkflowSummary = z.infer<typeof workflowSummarySchema>;
export type RichWorkflowSummary = z.infer<typeof richWorkflowSummarySchema>;

export type {
	PluginRun,
	SourceItem,
	WorkflowError,
	WorkflowRun,
	WorkflowRunInfo,
};
