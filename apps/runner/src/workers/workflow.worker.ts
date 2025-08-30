import type { Job } from "bullmq";
import { Effect } from "effect";
import { WorkflowService } from "../db";
import type {
	SourceQueryJobData,
	StartWorkflowRunJobData,
} from "../interfaces";
import { QUEUE_NAMES, QueueService } from "../queue";

const processWorkflowRun = (job: Job<StartWorkflowRunJobData>) =>
	Effect.gen(function* () {
		const { workflowId, workflowRunId, data } = job.data;
		const { triggeredBy } = data;
		const workflowService = yield* WorkflowService;
		const queueService = yield* QueueService;

		const workflow = yield* workflowService.getWorkflowById(workflowId);

		// Check if there's already a run in progress
		const existingRun = yield* workflowService.getActiveWorkflowRun(workflowId);
		if (existingRun && existingRun.id !== workflowRunId) {
			yield* Effect.log(
				`Workflow ${workflowId} already has an active run (${existingRun.id}). Skipping.`,
			);
			return;
		}

		const run = workflowRunId
			? yield* workflowService.getWorkflowRunById(workflowRunId)
			: yield* workflowService.createWorkflowRun({
					workflowId,
					status: "RUNNING",
					triggeredBy: triggeredBy ?? null,
				});

		yield* Effect.log(`Started Run ${run.id} for Workflow "${workflow.name}"`);

		const processingEffect = Effect.gen(function* () {
			// Enqueue the source query job to handle data fetching and polling
			const sourceJobData: SourceQueryJobData = {
				workflowId,
				workflowRunId: run.id,
				data: {
					lastProcessedState: null,
				},
			};

			yield* queueService.add(
				QUEUE_NAMES.SOURCE_QUERY,
				"query-source",
				sourceJobData,
			);
			yield* Effect.log(`Enqueued source query job for workflow ${workflowId}`);

			// Update the workflow run status to 'running'. The source worker will handle subsequent status updates.
			yield* workflowService.updateWorkflowRun(run.id, { status: "RUNNING" });
			yield* Effect.log(
				`Workflow run ${run.id} is running, source processing delegated to source worker`,
			);
		});

		return yield* processingEffect.pipe(
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const updatedRun = yield* workflowService.updateWorkflowRun(run.id, {
						status: "FAILED",
						completedAt: new Date(),
					});
					yield* Effect.logError(
						`Run for workflow ${workflowId} failed.`,
						error,
					);
					return yield* Effect.fail(error); // Allow BullMQ to handle retries
				}),
			),
		);
	});

export const createWorkflowWorker = Effect.gen(function* () {
	const queueService = yield* QueueService;
	yield* queueService.createWorker(
		QUEUE_NAMES.WORKFLOW_RUN,
		processWorkflowRun,
	);
});
