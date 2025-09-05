import { Effect, Layer, ManagedRuntime, type Stream } from "effect";
import type { z } from "zod";
import { type Plugin, type PluginLogger, PluginLoggerTag } from "../plugin";
import { PluginRuntimeError } from "./errors";
import {
	ModuleFederationService,
	PluginService,
	SecretsService,
} from "./services";
import { createSourceStream, type SourceStreamOptions } from "./streaming";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRuntimeConfig,
} from "./types";
import { validate } from "./validation";

// Default logger implementation
const createDefaultLogger = (): PluginLogger => ({
	logInfo: (message: string, context?: unknown) =>
		Effect.logInfo(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
	logWarning: (message: string, context?: unknown) =>
		Effect.logWarning(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
	logError: (message: string, error?: unknown, context?: unknown) =>
		Effect.logError(message, error).pipe(
			Effect.annotateLogs({ source: "plugin", error, context }),
		),
	logDebug: (message: string, context?: unknown) =>
		Effect.logDebug(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
});

// Main PluginRuntime service interface
export interface IPluginRuntime {
	readonly loadPlugin: (
		pluginId: string,
	) => Effect.Effect<PluginConstructor, PluginRuntimeError>;
	readonly instantiatePlugin: <T extends AnyPlugin>(
		ctor: PluginConstructor,
	) => Effect.Effect<PluginInstance<T>, PluginRuntimeError>;
	readonly initializePlugin: <T extends AnyPlugin>(
		instance: PluginInstance<T>,
		config: z.infer<T["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly executePlugin: <T extends AnyPlugin>(
		initializedPlugin: InitializedPlugin<T>,
		input: z.infer<T["inputSchema"]>,
	) => Effect.Effect<z.infer<T["outputSchema"]>, PluginRuntimeError>;
	readonly usePlugin: <T extends AnyPlugin>(
		pluginId: string,
		config: z.infer<T["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly streamPlugin: <
		T extends Plugin,
		TInput extends z.infer<T["inputSchema"]> = z.infer<T["inputSchema"]>,
		TItem = unknown
	>(
		pluginId: string,
		config: z.infer<T["configSchema"]>,
		input: TInput,
		options?: SourceStreamOptions<TItem>
	) => Effect.Effect<Stream.Stream<TItem, PluginRuntimeError>, PluginRuntimeError>;
	readonly shutdown: () => Effect.Effect<void, never, never>;
}

export class PluginRuntime extends Effect.Tag("PluginRuntime")<
	PluginRuntime,
	IPluginRuntime
>() {
	static Live = (config: PluginRuntimeConfig) => {
		const secrets = config.secrets || {};
		const logger = config.logger || createDefaultLogger();

		return Layer.effect(
			PluginRuntime,
			Effect.gen(function* () {
				const pluginService = yield* PluginService;

				return {
					loadPlugin: pluginService.loadPlugin,
					instantiatePlugin: pluginService.instantiatePlugin,
					initializePlugin: pluginService.initializePlugin,
					executePlugin: pluginService.executePlugin,

					usePlugin: <T extends AnyPlugin>(
						pluginId: string,
						config: z.infer<T["configSchema"]>,
					) => pluginService.usePlugin<T>(pluginId, config),
					streamPlugin: <
						T extends Plugin,
						TInput extends z.infer<T["inputSchema"]> = z.infer<T["inputSchema"]>,
						TItem = unknown
					>(
						pluginId: string,
						config: z.infer<T["configSchema"]>,
						input: TInput,
						options?: SourceStreamOptions<TItem>
					) => Effect.gen(function* () {
						// Get initialized plugin (benefits from caching)
						const initializedPlugin = yield* pluginService.usePlugin<T>(pluginId, config);

						// Check if procedure is streamable and validate state
						const procedureName = (input as { procedure: string }).procedure;
						const isStreamable = initializedPlugin.plugin.isStreamable(procedureName);

						if (!isStreamable) {
							return yield* Effect.fail(
								new PluginRuntimeError({
									pluginId,
									operation: "stream-plugin-validate",
									cause: new Error(`Procedure ${procedureName} is not streamable`),
									retryable: false,
								})
							);
						}

						// Check stateSchema exists for streamable procedures
						if (!('stateSchema' in initializedPlugin.plugin) || !initializedPlugin.plugin.stateSchema) {
							return yield* Effect.fail(
								new PluginRuntimeError({
									pluginId: initializedPlugin.plugin.id,
									operation: "validate-state",
									cause: new Error(`Streamable plugin ${initializedPlugin.plugin.id} must have a stateSchema`),
									retryable: false,
								})
							);
						}

						// Validate initial state
						yield* validate(
							initializedPlugin.plugin.stateSchema,
							input.state,
							initializedPlugin.plugin.id,
							"state",
						).pipe(
							Effect.mapError(
								(validationError): PluginRuntimeError =>
									new PluginRuntimeError({
										pluginId: initializedPlugin.plugin.id,
										operation: "validate-state",
										cause: validationError.zodError,
										retryable: false,
									})
							),
						);

						// Create and return the stream
						return createSourceStream<T, TInput, TItem>(
							initializedPlugin,
							pluginService.executePlugin,
							input,
							options
						);
					}),
					shutdown: () => pluginService.cleanup(),
				};
			}),
		).pipe(
			Layer.provide(
				PluginService.Live(config.registry, secrets).pipe(
					Layer.provide(
						Layer.mergeAll(
							ModuleFederationService.Live,
							SecretsService.Live(secrets),
							Layer.succeed(PluginLoggerTag, logger),
						),
					),
				),
			),
		);
	}
}

export const createPluginRuntime = (config: PluginRuntimeConfig) =>
	ManagedRuntime.make(PluginRuntime.Live(config));
