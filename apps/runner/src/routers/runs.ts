import { Effect } from "effect";
import { z } from "zod";
import { WorkflowService } from "../db";
import { adminProcedure, authenticatedProcedure } from "../lib/orpc";
import { QUEUE_NAMES, QueueService, StateService } from "../queue";

// Inline schema definitions
const runIdParamSchema = z.object({
	runId: z.string(),
});

const retryFromStepSchema = z.object({
	runId: z.string(),
	itemId: z.string(),
	fromStepId: z.string(),
});

export const runRouter = {
	getDetails: authenticatedProcedure
		.input(runIdParamSchema)
		.handler(async ({ input, context }) => {
			const { runId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const run = yield* workflowService.getWorkflowRunById(runId);
				return {
					success: true,
					data: run,
				};
			});

			return await context.runtime.runPromise(program);
		}),

	retryFromStep: adminProcedure
		.input(retryFromStepSchema)
		.handler(async ({ input, context }) => {
			const { runId, itemId, fromStepId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const queueService = yield* QueueService;

				const failedRun = yield* workflowService.getPluginRunByStep(
					runId,
					itemId,
					fromStepId,
				);
				const run = yield* workflowService.getWorkflowRunById(runId);
				yield* queueService.add(
					QUEUE_NAMES.PIPELINE_EXECUTION,
					"retry-pipeline-step",
					{
						workflowId: run.workflowId,
						workflowRunId: runId,
						data: {
							sourceItemId: itemId,
							input: failedRun.input as Record<string, unknown>,
							startAtStepId: fromStepId,
						},
					},
				);

				return `Retrying item ${itemId} from step ${fromStepId}.`;
			});

			const message = await context.runtime.runPromise(program);
			return {
				success: true,
				data: { message },
			};
		}),

	cancel: adminProcedure
		.input(runIdParamSchema)
		.handler(async ({ input, context }) => {
			const { runId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const stateService = yield* StateService;
				const run = yield* workflowService.getWorkflowRunById(runId);
				yield* workflowService.updateWorkflowRun(runId, {
					status: "CANCELLED",
				});
				yield* stateService.publish({
					type: "WORKFLOW_RUN_CANCELLED",
					data: run,
				});
				return {
					success: true,
					data: { message: `Workflow run ${runId} has been stopped.` },
				};
			});

			return await context.runtime.runPromise(program);
		}),

	delete: adminProcedure
		.input(runIdParamSchema)
		.handler(async ({ input, context }) => {
			const { runId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const stateService = yield* StateService;
				const run = yield* workflowService.getWorkflowRunById(runId);
				yield* workflowService.deleteWorkflowRun(runId);
				yield* stateService.publish({
					type: "WORKFLOW_RUN_DELETED",
					data: run,
				});
				return {
					success: true,
					data: { message: `Workflow run ${runId} has been deleted.` },
				};
			});

			return await context.runtime.runPromise(program);
		}),

	getItems: authenticatedProcedure
		.input(z.object({ runId: z.string() }))
		.handler(async ({ input, context }) => {
			const { runId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const items = yield* workflowService.getItemsForWorkflowRun(runId);
				return { success: true, data: items };
			});

			return await context.runtime.runPromise(program);
		}),

	getPluginRuns: authenticatedProcedure
		.input(
			z.object({
				runId: z.string(),
				type: z.enum(["SOURCE", "PIPELINE"]).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { runId, type } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const pluginRuns = yield* workflowService.getPluginRunsForWorkflowRun(
					runId,
					type,
				);
				return {
					success: true,
					data: {
						type: type || "ALL",
						pluginRuns,
					},
				};
			});

			return await context.runtime.runPromise(program);
		}),
};
