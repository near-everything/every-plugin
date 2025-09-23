import { Effect, Layer, ManagedRuntime, type Stream } from "effect";
import type { z } from "zod";
import { type PluginLogger, PluginLoggerTag } from "../plugin";
import type { PluginRuntimeError } from "./errors";
import {
	ModuleFederationService,
	PluginService,
	SecretsService,
} from "./services";
import type { StreamingOptions } from "./streaming";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRuntimeConfig,
} from "./types";

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
		T extends AnyPlugin,
		TItem = unknown,
	>(
		initializedPlugin: InitializedPlugin<T>,
		input: z.infer<T["inputSchema"]>,
		options?: StreamingOptions<TItem, z.infer<T["stateSchema"]>>
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

					usePlugin: pluginService.usePlugin,
					streamPlugin: pluginService.streamPlugin,
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
