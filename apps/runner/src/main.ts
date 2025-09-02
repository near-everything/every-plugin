import { Effect, Schedule } from "effect";
import { AppConfig } from "./config";
import { HttpServerService } from "./http/server";
import { discoverAndScheduleWorkflows } from "./jobs";
import { AppRuntime } from "./runtime/app";
import { WorkersRuntime } from "./runtime/worker";
import { createPipelineWorker } from "./workers/pipeline.worker";
import { createSourceWorker } from "./workers/source.worker";
import { createWorkflowWorker } from "./workers/workflow.worker";

// HTTP server + scheduler
const httpAndSchedulerProgram = Effect.scoped(
	Effect.gen(function* () {
		const config = yield* AppConfig;
		const httpServer = yield* HttpServerService;

		// Start HTTP server explicitly to get startup logs
		yield* httpServer.start();

		yield* Effect.log(`🚀 Server ready at http://localhost:${config.port}`);
		yield* Effect.log(`📊 Health check: http://localhost:${config.port}/`);
		yield* Effect.log(`🔌 API endpoint: http://localhost:${config.port}/rpc`);

		// Repeatable job (scheduler)
		const scheduledDiscovery = Effect.repeat(
			discoverAndScheduleWorkflows,
			Schedule.spaced("1 minute"),
		).pipe(
			Effect.catchAll((error) =>
				Effect.logError("Error in workflow discovery", error),
			),
		);

		// Fork scheduler
		yield* Effect.fork(scheduledDiscovery);

		yield* Effect.log("✅ HTTP server and scheduler started");
		yield* Effect.never;
	}),
).pipe(
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			yield* Effect.logError("❌ HTTP server startup failed", error);
		}),
	),
);

// Workers program
const workersProgram = Effect.scoped(
	Effect.gen(function* () {
		yield* Effect.log("🔄 Starting background workers...");
		yield* Effect.fork(createWorkflowWorker);
		yield* Effect.fork(createSourceWorker);
		yield* Effect.fork(createPipelineWorker);

		yield* Effect.log("✅ All workers started");
		yield* Effect.never;
	}),
).pipe(
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			yield* Effect.logError("❌ Workers startup failed", error);
		}),
	),
);

// Run both programs concurrently
Promise.all([
	AppRuntime.runPromise(httpAndSchedulerProgram),
	WorkersRuntime.runPromise(workersProgram),
]).catch(console.error);
