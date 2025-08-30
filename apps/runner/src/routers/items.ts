import { Effect } from "effect";
import { z } from "zod";
import { WorkflowService } from "../db";
import { adminProcedure, authenticatedProcedure } from "../lib/orpc";
import { QUEUE_NAMES, QueueService } from "../queue";

export const itemRouter = {
	getPluginRuns: authenticatedProcedure
		.input(z.object({ itemId: z.string() }))
		.handler(async ({ input, context }) => {
			const { itemId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const pluginRuns = yield* workflowService.getPluginRunsForItem(itemId);
				return { success: true, data: pluginRuns };
			});

			return await context.runtime.runPromise(program);
		}),

	getWorkflowRuns: authenticatedProcedure
		.input(z.object({ itemId: z.string() }))
		.handler(async ({ input, context }) => {
			const { itemId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const workflowRuns =
					yield* workflowService.getWorkflowRunsForItem(itemId);
				return { success: true, data: workflowRuns };
			});

			return await context.runtime.runPromise(program);
		}),

	retryPluginRun: adminProcedure
		.input(
			z.object({
				itemId: z.string(),
				pluginRunId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { itemId, pluginRunId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const queueService = yield* QueueService;

				const pluginRun = yield* workflowService.updatePluginRun(pluginRunId, {
					status: "PENDING",
					error: null,
					output: null,
					completedAt: null,
				});

				const workflowRun = yield* workflowService.getWorkflowRunById(
					pluginRun.workflowRunId,
				);

				yield* queueService.add(
					QUEUE_NAMES.PIPELINE_EXECUTION,
					`retry-from-step-${pluginRun.stepId}`,
					{
						workflowId: workflowRun.workflowId,
						workflowRunId: pluginRun.workflowRunId,
						data: {
							sourceItemId: itemId,
							input: pluginRun.input as Record<string, unknown>,
							startAtStepId: pluginRun.stepId,
						},
					},
				);

				return {
					success: true,
					data: {
						message: `Plugin run ${pluginRunId} queued for retry from step ${pluginRun.stepId}`,
					},
				};
			});

			return await context.runtime.runPromise(program);
		}),
};
