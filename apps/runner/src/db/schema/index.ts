import * as auth from "./auth";
import * as pluginRun from "./plugin-run";
import * as sourceItem from "./source-item";
import * as workflow from "./workflow";
import * as workflowRun from "./workflow-run";
import * as workflowRunsToSourceItems from "./workflow-runs-to-source-items";
import * as workflowsToSourceItems from "./workflows-to-source-items";

export const schema = {
	...auth,
	...workflow,
	...workflowRun,
	...sourceItem,
	...pluginRun,
	...workflowsToSourceItems,
	...workflowRunsToSourceItems,
};

export * from "./auth";
export * from "./plugin-run";
export * from "./source-item";
export * from "./workflow";
export * from "./workflow-run";
export * from "./workflow-runs-to-source-items";
export * from "./workflows-to-source-items";

export type DB = typeof schema;
