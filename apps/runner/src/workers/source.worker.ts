import type { Job } from "bullmq";
import { Effect } from "effect";
import { PluginRuntime } from "every-plugin/runtime";
import { WorkflowService } from "../db";
import type { ExecutePipelineJobData, SourceQueryJobData } from "../interfaces";
import { QUEUE_NAMES, QueueService } from "../queue";

const processSourceQueryJob = (job: Job<SourceQueryJobData>) =>
	Effect.gen(function* () {
		const { workflowId, workflowRunId, data } = job.data;
		if (!workflowRunId) {
			return yield* Effect.fail(
				new Error("workflowRunId is required for source query jobs"),
			);
		}
		const workflowService = yield* WorkflowService;
		const activeRun = yield* workflowService.getActiveWorkflowRun(workflowId);

		if (activeRun && activeRun.id !== workflowRunId) {
			yield* Effect.log(
				`Workflow ${workflowId} has another active run (${activeRun.id}). Delaying job.`,
			);
			// Re-enqueue the job with a delay
			yield* Effect.tryPromise(() =>
				job.moveToDelayed(Date.now() + 60000, job.token!),
			);
			return;
		}
		const { lastProcessedState } = data;
		const queueService = yield* QueueService;
		const pluginRuntime = yield* PluginRuntime;

		yield* Effect.log(
			`Processing source query job for workflow: ${workflowId}, run: ${workflowRunId}`,
		);

		const workflow = yield* workflowService.getWorkflowById(workflowId);
		const input = {
			searchOptions: workflow.source.search,
			lastProcessedState: lastProcessedState ?? workflow.state,
		};

		const pluginRun = yield* workflowService.createPluginRun({
			workflowRunId,
			pluginId: workflow.source.pluginId,
			config: workflow.source.config,
			status: "RUNNING",
			input,
			startedAt: new Date(),
			stepId: "source",
			sourceItemId: null,
			type: "SOURCE",
			retryCount: "0",
		});

		const pluginEffect = Effect.gen(function* () {
			const pluginConstructor = yield* pluginRuntime.loadPlugin(
				workflow.source.pluginId,
			);
			const pluginInstance =
				yield* pluginRuntime.instantiatePlugin(pluginConstructor);
			const initializedPlugin = yield* pluginRuntime.initializePlugin(
				pluginInstance,
				workflow.source.config,
			);

			const output = yield* pluginRuntime.executePlugin(
				initializedPlugin,
				input,
			);

			// TODO: proper typing
			const sourceOutput = output as {
				success: boolean;
				data?: { items: any[]; nextLastProcessedState?: any };
				errors?: any[];
			};

			if (!sourceOutput.success || !sourceOutput.data) {
				const error = new Error("Source plugin failed to return data");
				yield* workflowService.updatePluginRun(pluginRun.id, {
					status: "FAILED",
					error: {
						message: "Source plugin failed to return data",
						cause: sourceOutput.errors,
					},
					completedAt: new Date(),
				});
				return yield* Effect.fail(error);
			}

			yield* workflowService.updatePluginRun(pluginRun.id, {
				status: "COMPLETED",
				output: sourceOutput,
				completedAt: new Date(),
			});

			return sourceOutput.data;
		}).pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const errorMessage =
						error instanceof Error ? error.message : "Unknown error";
					const errorCause =
						error instanceof Error && error.cause ? error.cause : error;

					yield* workflowService.updatePluginRun(pluginRun.id, {
						status: "FAILED",
						error: {
							message: "Failed to execute source plugin",
							cause: {
								message: errorMessage,
								cause: errorCause,
							},
						},
						completedAt: new Date(),
					});
					return yield* Effect.fail(error);
				}),
			),
		);

		const { items, nextLastProcessedState } = yield* pluginEffect;

		yield* workflowService.updateWorkflowRun(workflowRunId, {
			itemsTotal: items.length,
		});

		const processingEffect = Effect.gen(function* () {
			if (items.length > 0) {
				yield* Effect.log(
					`Enqueuing ${items.length} items for pipeline processing`,
				);

				const processedItems = yield* Effect.forEach(
					items,
					(item) =>
						Effect.gen(function* () {
							const sourceItem = yield* workflowService.upsertSourceItem({
								workflowId,
								externalId: item.externalId,
								data: item,
								processedAt: null,
							});

							yield* workflowService.addItemToWorkflowRun({
								workflowRunId,
								sourceItemId: sourceItem.id,
							});

							const pipelineJobData: ExecutePipelineJobData = {
								workflowId,
								workflowRunId,
								data: {
									sourceItemId: sourceItem.id,
									input: sourceItem.data,
								},
							};

							yield* queueService.add(
								QUEUE_NAMES.PIPELINE_EXECUTION,
								`process-item`,
								pipelineJobData,
							);

							return sourceItem.id;
						}),
					{ concurrency: 10 },
				);

				yield* Effect.log(
					`Enqueued ${processedItems.length} items for pipeline processing`,
				);
			}
		});

		yield* processingEffect.pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					yield* workflowService.updatePluginRun(pluginRun.id, {
						status: "FAILED",
						error: {
							message: "Failed to process source items",
							cause: error,
						},
						completedAt: new Date(),
					});
					return yield* Effect.fail(error);
				}),
			),
		);

		if (nextLastProcessedState?.currentAsyncJob) {
			const job = nextLastProcessedState.currentAsyncJob;

			if (job.status === "done") {
				yield* Effect.log(
					`Async job completed for workflow ${workflowId}. Clearing job from state.`,
				);

				// Clear the async job from workflow state so future runs aren't blocked
				yield* workflowService.updateWorkflow(workflowId, {
					state: {
						data: {
							...nextLastProcessedState,
							currentAsyncJob: null,
						},
					},
				});

				yield* workflowService.updateWorkflowRun(workflowRunId, {
					status: "COMPLETED",
					completedAt: new Date(),
				});
				yield* Effect.log(
					`Source query completed for workflow ${workflowId}, processed ${items.length} items.`,
				);
			} else if (job.status === "error" || job.status === "timeout") {
				yield* Effect.log(
					`Async job ${job.status} for workflow ${workflowId}. Failing plugin run.`,
				);

				yield* workflowService.updatePluginRun(pluginRun.id, {
					status: "FAILED",
					error: {
						message: `Async job ${job.status}`,
						details: { errorMessage: job.errorMessage },
					},
					completedAt: new Date(),
				});
				yield* workflowService.updateWorkflowRun(workflowRunId, {
					status: "FAILED",
					completedAt: new Date(),
					failureReason: `Async job ${job.status}: ${job.errorMessage || "Unknown error"}`,
				});
			} else if (["submitted", "pending", "processing"].includes(job.status)) {
				yield* Effect.log(
					`Async job still ${job.status} for workflow ${workflowId}. Enqueueing follow-up source query.`,
				);

				yield* workflowService.updateWorkflow(workflowId, {
					state: { data: nextLastProcessedState },
				});

				yield* workflowService.updateWorkflowRun(workflowRunId, {
					status: "RUNNING",
				});

				const followUpJobData: SourceQueryJobData = {
					workflowId,
					workflowRunId,
					data: {
						lastProcessedState: { data: nextLastProcessedState },
					},
				};

				const delay = 60000;
				yield* queueService.add(
					QUEUE_NAMES.SOURCE_QUERY,
					`continue-source-query`,
					followUpJobData,
					{ delay },
				);

				yield* Effect.log(
					`Enqueued follow-up source query for workflow ${workflowId} with ${delay}ms delay`,
				);
			}
		} else {
			yield* workflowService.updateWorkflowRun(workflowRunId, {
				status: "COMPLETED",
				completedAt: new Date(),
			});
			yield* Effect.log(
				`Source query completed for workflow ${workflowId}, processed ${items.length} items.`,
			);
		}
	}).pipe(
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				const { workflowId, workflowRunId } = job.data;
				const workflowService = yield* WorkflowService;
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				yield* workflowService.updateWorkflowRun(workflowRunId!, {
					status: "FAILED",
					completedAt: new Date(),
					failureReason: errorMessage,
				});
				yield* Effect.logError(
					`Source query for workflow ${workflowId} failed.`,
					error,
				);
				return yield* Effect.fail(error);
			}),
		),
	);

export const createSourceWorker = Effect.gen(function* () {
	const queueService = yield* QueueService;
	yield* queueService.createWorker(
		QUEUE_NAMES.SOURCE_QUERY,
		processSourceQueryJob,
	);
});
