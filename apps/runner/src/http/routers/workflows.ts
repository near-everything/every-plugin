import { Effect } from "effect";
import { z } from "zod";
import { WorkflowService } from "../../db";
import { createWorkflowSchema, updateWorkflowSchema } from "../../interfaces";
import { QUEUE_NAMES, QueueService } from "../../queue";
import { adminProcedure, authenticatedProcedure } from "../lib/orpc";

const idParamSchema = z.object({
	id: z.string().min(1),
});

export const workflowRouter = {
	getAll: authenticatedProcedure.handler(async ({ context }) => {
		const program = Effect.gen(function* () {
			const workflowService = yield* WorkflowService;
			const workflows = yield* workflowService.getWorkflows();
			return { success: true, data: workflows };
		});

		const result = await context.runtime.runPromise(program);
		return result;
	}),

	getById: authenticatedProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const workflow = yield* workflowService.getWorkflowById(id);
				return { success: true, data: workflow };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	create: adminProcedure
		.input(createWorkflowSchema)
		.handler(async ({ input, context }) => {
			const user = context.user;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;

				const newWorkflow = yield* workflowService.createWorkflow({
					...input,
					createdBy: user.id,
					schedule: input.schedule ?? null,
					state: input.state ?? null,
				});

				return { success: true, data: newWorkflow };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	update: adminProcedure
		.input(
			z.object({
				id: z.string(),
				...updateWorkflowSchema.shape,
			}),
		)
		.handler(async ({ input, context }) => {
			const { id, ...body } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const updatedWorkflow = yield* workflowService.updateWorkflow(id, body);
				return { success: true, data: updatedWorkflow };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	toggle: adminProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const workflow = yield* workflowService.getWorkflowById(id);
				const newStatus = workflow.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

				const updatedWorkflow = yield* workflowService.updateWorkflow(id, {
					status: newStatus,
				});
				return { success: true, data: updatedWorkflow };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	run: adminProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;
			const user = context.user;

			const program = Effect.gen(function* () {
				const queueService = yield* QueueService;
				const workflowService = yield* WorkflowService;

				const run = yield* workflowService.createWorkflowRun({
					workflowId: id,
					status: "PENDING",
					triggeredBy: user.id,
				});

				yield* queueService.add(
					QUEUE_NAMES.WORKFLOW_RUN,
					"start-workflow-run",
					{
						workflowId: id,
						workflowRunId: run.id,
						data: {
							triggeredBy: user.id,
						},
					},
				);
				return { success: true, data: run };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	delete: adminProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				yield* workflowService.deleteWorkflow(id);
				return {
					success: true,
					data: { message: `Workflow ${id} has been deleted.` },
				};
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	getRuns: authenticatedProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const runs = yield* workflowService.getWorkflowRuns(id);
				return { success: true, data: runs };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	getItems: authenticatedProcedure
		.input(idParamSchema)
		.handler(async ({ input, context }) => {
			const { id } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const items = yield* workflowService.getItemsForWorkflow(id);
				return { success: true, data: items };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),

	getItemPluginRuns: authenticatedProcedure
		.input(
			z.object({
				id: z.string(),
				itemId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { id: workflowId, itemId } = input;

			const program = Effect.gen(function* () {
				const workflowService = yield* WorkflowService;
				const pluginRuns = yield* workflowService.getPluginRunsForItem(
					itemId,
					workflowId,
				);
				return { success: true, data: pluginRuns };
			});

			const result = await context.runtime.runPromise(program);
			return result;
		}),
};
