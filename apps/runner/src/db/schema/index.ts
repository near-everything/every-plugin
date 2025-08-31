import * as auth from "./auth";
import * as pluginRun from "./plugin-run";
import * as sourceItem from "./source-item";
import * as workflow from "./workflow";
import * as workflowRun from "./workflow-run";
import * as workflowRunsToSourceItems from "./workflow-runs-to-source-items";
import * as workflowsToSourceItems from "./workflows-to-source-items";

export const schema = {
	...auth, // TODO: move this out, to standalone SQLite
	...workflow, // TODO: this should be shade agent contract (global contract, pays deposit to run)
	...workflowRun, // TODO: move to redis
	...sourceItem, // TODO: this could be moved to RSS... why does source item need to be standardized? It is just pipeline run anyway... could be called a loop
	...pluginRun, // TODO: move to redis
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


// Redis (execution state):
// - workflow-run:{runId} -> hash of run details
// - plugin-run:{pluginRunId} -> hash of plugin execution
// - workflow-run:{runId}:items -> set of processed source item IDs
// - workflow-runs:active -> sorted set by start time
// - Events: workflow:events stream for dashboard updates

// PostgreSQL (persistent data):
// - source-item (your business data)
// - workflows-to-source-items (until smart contract migration)
// - auth (moving to SQLite as discussed)