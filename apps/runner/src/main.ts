import { Effect, Schedule } from "effect";
import { AppConfig } from "./config";
import { discoverAndScheduleWorkflows } from "./jobs";
import { PluginRuntimeLive } from "./plugin-runtime";
import { AppRuntime } from "./runtime/app";
import { HttpServerService } from "./services/http-server.service";
import { createPipelineWorker } from "./workers/pipeline.worker";
import { createSourceWorker } from "./workers/source.worker";
import { createWorkflowWorker } from "./workers/workflow.worker";

// Single process: HTTP server + scheduler + workers
const program = Effect.scoped(
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

		// Fork workers in the same process
		yield* Effect.log("🔄 Starting background workers...");
		yield* Effect.fork(createWorkflowWorker);
		yield* Effect.fork(
			createSourceWorker.pipe(Effect.provide(PluginRuntimeLive)),
		);
		yield* Effect.fork(
			createPipelineWorker.pipe(Effect.provide(PluginRuntimeLive)),
		);

		yield* Effect.log(
			"✅ Application fully started (HTTP server + scheduler + workers)",
		);
		yield* Effect.never;
	}),
).pipe(
	Effect.catchAll((error) =>
		Effect.gen(function* () {
			yield* Effect.logError("❌ Application startup failed", error);
		}),
	),
);

AppRuntime.runPromise(program).catch(console.error);
