import { createOutputSchema } from "every-plugin";
import type { Job } from "bullmq";
import { Effect } from "effect";
import { z } from "zod";
import { WorkflowService } from "../db";
import type { ExecutePipelineJobData, PluginRun } from "../interfaces";
import { PluginServiceTag } from "../plugin-runtime/plugin.service";
import { QUEUE_NAMES, QueueService, StateService } from "../queue";

// Create a generic output schema for parsing plugin outputs
const GenericPluginOutputSchema = createOutputSchema(z.unknown());

const processPipelineJob = (job: Job<ExecutePipelineJobData>) =>
	Effect.gen(function* () {
		const { workflowId, workflowRunId, data } = job.data;
		if (!workflowRunId) {
			return yield* Effect.fail(
				new Error("workflowRunId is required for pipeline jobs"),
			);
		}

		const { sourceItemId, input, startAtStepId } = data;
		const workflowService = yield* WorkflowService;
		const pluginService = yield* PluginServiceTag;
		const stateService = yield* StateService;

		const run = yield* workflowService.getWorkflowRunById(workflowRunId);
		const workflow = yield* workflowService.getWorkflowById(workflowId);

		let currentInput: any = input;

		// Find starting step index
		let startIndex = 0;
		if (startAtStepId) {
			const stepIndex = workflow.pipeline.steps.findIndex(
				(s) => s.stepId === startAtStepId,
			);
			if (stepIndex === -1) {
				return yield* Effect.fail(
					new Error(`Step ${startAtStepId} not found in pipeline`),
				);
			}
			startIndex = stepIndex;
			yield* Effect.log(
				`Starting pipeline from step ${startAtStepId} (index ${startIndex})`,
			);
		}

		// Process pipeline steps starting from the specified step
		const stepsToProcess = workflow.pipeline.steps.slice(startIndex);

		for (const stepDefinition of stepsToProcess) {
			// Check if this plugin run already exists (for retries)
			const existingPluginRun = yield* workflowService
				.getPluginRunByStep(workflowRunId, sourceItemId, stepDefinition.stepId)
				.pipe(Effect.catchAll(() => Effect.succeed(null)));

			let pluginRun: PluginRun;
			if (existingPluginRun && existingPluginRun.status === "PENDING") {
				// Update existing plugin run for retry
				pluginRun = yield* workflowService.updatePluginRun(
					existingPluginRun.id,
					{
						status: "RUNNING",
						output: null,
						error: null,
						completedAt: null,
					},
				);
			} else if (
				existingPluginRun &&
				existingPluginRun.status === "COMPLETED"
			) {
				// Skip already completed step and use its output
				currentInput = existingPluginRun.output;
				yield* Effect.log(`Skipping completed step ${stepDefinition.stepId}`);
				continue;
			} else {
				// Create new plugin run
				pluginRun = yield* workflowService.createPluginRun({
					workflowRunId,
					sourceItemId,
					stepId: stepDefinition.stepId,
					pluginId: stepDefinition.pluginId,
					config: stepDefinition.config,
					status: "RUNNING",
					input: currentInput,
					startedAt: new Date(),
					type: "PIPELINE",
					retryCount: "0",
				});
			}

			yield* stateService.publish({
				type: "PLUGIN_RUN_STARTED",
				data: pluginRun,
			});

			const pluginEffect = Effect.gen(function* () {
				const execute = Effect.acquireUseRelease(
					pluginService.initializePlugin(
						stepDefinition,
						`Run ${workflowRunId}, Item ${sourceItemId}, Step "${stepDefinition.stepId}"`,
					),
					(plugin) =>
						pluginService.executePlugin(
							plugin,
							currentInput,
							`Run ${workflowRunId}, Item ${sourceItemId}, Step "${stepDefinition.stepId}"`,
						),
					() => Effect.void,
				);

				const rawOutput = yield* execute;
				const parseResult = GenericPluginOutputSchema.safeParse(rawOutput);

				if (!parseResult.success) {
					const error = new Error(
						`Plugin output validation failed: ${parseResult.error.message}`,
					);
					const updatedRun = yield* workflowService.updatePluginRun(
						pluginRun.id,
						{
							status: "FAILED",
							error: { message: error.message },
							completedAt: new Date(),
						},
					);
					yield* stateService.publish({
						type: "PLUGIN_RUN_FAILED",
						data: updatedRun,
					});
					return yield* Effect.fail(error);
				}

				const output = parseResult.data;

				if (!output.success) {
					const error = new Error(
						`Plugin ${
							stepDefinition.pluginId
						} execution failed: ${JSON.stringify(output.errors)}`,
					);
					const updatedRun = yield* workflowService.updatePluginRun(
						pluginRun.id,
						{
							status: "FAILED",
							error: { message: error.message },
							completedAt: new Date(),
						},
					);
					yield* stateService.publish({
						type: "PLUGIN_RUN_FAILED",
						data: updatedRun,
					});
					return yield* Effect.fail(error);
				}

				const updatedRun = yield* workflowService.updatePluginRun(
					pluginRun.id,
					{
						status: "COMPLETED",
						output,
						completedAt: new Date(),
					},
				);

				yield* stateService.publish({
					type: "PLUGIN_RUN_COMPLETED",
					data: updatedRun,
				});

				return output.data;
			}).pipe(
				Effect.catchAll((error) =>
					Effect.gen(function* () {
						const updatedRun = yield* workflowService.updatePluginRun(
							pluginRun.id,
							{
								status: "FAILED",
								error: {
									message: "Failed to execute pipeline step",
									cause: error,
								},
								completedAt: new Date(),
							},
						);
						yield* stateService.publish({
							type: "PLUGIN_RUN_FAILED",
							data: updatedRun,
						});
						return yield* Effect.fail(error);
					}),
				),
			);

			currentInput = yield* pluginEffect;
		}

		// Mark item as processed in this workflow run
		yield* workflowService.markItemProcessedInRun(workflowRunId, sourceItemId);

		// Check if all items in the run are processed
		const runItems =
			yield* workflowService.getItemsForWorkflowRun(workflowRunId);

		// Count processed items by checking the processedAt field in the junction table
		// This would need to be implemented properly in the service method
		// For now, we'll use a simple approach
		let processedCount = 0;
		for (const item of runItems) {
			// This is a simplified check - in reality we'd need to check the junction table
			if (item.processedAt) {
				processedCount++;
			}
		}

		// Update items processed count
		yield* workflowService.updateWorkflowRun(workflowRunId, {
			itemsProcessed: processedCount,
		});

		// If all items are processed, mark the workflow run as completed
		if (processedCount === runItems.length && runItems.length > 0) {
			const updatedRun = yield* workflowService.updateWorkflowRun(
				workflowRunId,
				{
					status: "COMPLETED",
					completedAt: new Date(),
				},
			);
			yield* stateService.publish({
				type: "WORKFLOW_RUN_COMPLETED",
				data: updatedRun,
			});
			yield* Effect.log(
				`Workflow run ${workflowRunId} completed - all ${runItems.length} items processed`,
			);
		}

		yield* Effect.log(`Pipeline completed for Item ${sourceItemId}`);
	}).pipe(
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				const { workflowRunId, data } = job.data;
				const { sourceItemId } = data;
				const workflowService = yield* WorkflowService;

				// Don't fail the entire run for one item failure
				yield* Effect.logError(
					`Pipeline failed for Item ${sourceItemId}`,
					error,
				);

				// Update the run status to partial success if other items might succeed
				const currentRun = yield* workflowService.getWorkflowRunById(
					workflowRunId!,
				);
				if (currentRun.status === "RUNNING") {
					yield* workflowService.updateWorkflowRun(workflowRunId!, {
						status: "PARTIAL_SUCCESS",
					});
				}

				return yield* Effect.fail(error);
			}),
		),
	);

export const createPipelineWorker = Effect.gen(function* () {
	const queueService = yield* QueueService;
	yield* queueService.createWorker(
		QUEUE_NAMES.PIPELINE_EXECUTION,
		processPipelineJob,
	);
});
