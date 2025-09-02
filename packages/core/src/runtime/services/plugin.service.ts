import { Duration, Effect, Layer, Schedule } from "effect";
import { PluginLoggerTag, type PluginRegistry } from "../../plugin";
import { PluginRuntimeError } from "../errors";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	SecretsConfig,
} from "../types";
import { validate } from "../validation";
import { PluginCacheService } from "./plugin-cache.service";
import { SecretsService } from "./secrets.service";

export interface IPluginService {
	readonly loadPlugin: (
		pluginId: string,
	) => Effect.Effect<PluginConstructor, PluginRuntimeError>;
	readonly instantiatePlugin: <T extends AnyPlugin>(
		pluginConstructor: PluginConstructor,
	) => Effect.Effect<PluginInstance<T>, PluginRuntimeError>;
	readonly initializePlugin: <T extends AnyPlugin>(
		pluginInstance: PluginInstance<T>,
		config: unknown,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly executePlugin: <T extends AnyPlugin>(
		initializedPlugin: InitializedPlugin<T>,
		input: unknown,
	) => Effect.Effect<any, PluginRuntimeError>;
}

export class PluginService extends Effect.Tag("PluginService")<
	PluginService,
	IPluginService
>() {
	static Live = (registry: PluginRegistry, secrets: SecretsConfig) =>
		Layer.effect(
			PluginService,
			Effect.gen(function* () {
				const cacheService = yield* PluginCacheService;
				const secretsService = yield* SecretsService;
				const logger = yield* PluginLoggerTag;

				const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(
					Schedule.compose(Schedule.recurs(2)),
				);

				const resolveUrl = (baseUrl: string, version?: string): string =>
					version && version !== "latest"
						? baseUrl.replace("@latest", `@${version}`)
						: baseUrl;

				return {
					loadPlugin: (pluginId: string) =>
						Effect.gen(function* () {
							const metadata = registry[pluginId];
							if (!metadata) {
								return yield* Effect.fail(
									new PluginRuntimeError({
										pluginId,
										operation: "load-plugin",
										cause: new Error(
											`Plugin ${pluginId} not found in registry`,
										),
										retryable: false,
									}),
								);
							}

							const url = resolveUrl(metadata.remoteUrl);
							const cacheKey = `${pluginId}:${url}`;

							const cachedConstructor =
								yield* cacheService.getCachedConstructor(cacheKey);

							return {
								ctor: cachedConstructor.ctor,
								metadata: {
									pluginId,
									version: metadata.version,
									description: metadata.description,
									type: metadata.type,
								},
							} satisfies PluginConstructor;
						}),

					instantiatePlugin: <T extends AnyPlugin>(
						pluginConstructor: PluginConstructor,
					) =>
						Effect.gen(function* () {
							const instance = yield* Effect.try({
								try: () => new pluginConstructor.ctor() as T,
								catch: (error): PluginRuntimeError =>
									new PluginRuntimeError({
										pluginId: pluginConstructor.metadata.pluginId,
										operation: "instantiate-plugin",
										cause:
											error instanceof Error ? error : new Error(String(error)),
										retryable: false,
									}),
							});

							// Validate plugin ID matches
							if (instance.id !== pluginConstructor.metadata.pluginId) {
								return yield* Effect.fail(
									new PluginRuntimeError({
										pluginId: pluginConstructor.metadata.pluginId,
										operation: "validate-plugin-id",
										cause: new Error(
											`Plugin ID mismatch: expected ${pluginConstructor.metadata.pluginId}, got ${instance.id}`,
										),
										retryable: false,
									}),
								);
							}

							return {
								plugin: instance,
								metadata: pluginConstructor.metadata,
							} satisfies PluginInstance<T>;
						}),

					initializePlugin: <T extends AnyPlugin>(
						pluginInstance: PluginInstance<T>,
						config: unknown,
					) =>
						Effect.gen(function* () {
							const { plugin } = pluginInstance;

							// Validate raw config using plugin's Zod schema
							const validatedConfig = yield* validate(
								plugin.configSchema,
								config,
								plugin.id,
								"config",
							).pipe(
								Effect.mapError(
									(validationError): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "validate-config",
											cause: validationError.zodError,
											retryable: false,
										}),
								),
							);

							// Hydrate secrets
							const hydratedConfig = yield* secretsService.hydrateSecrets(
								validatedConfig,
								secrets,
							);

							// Validate hydrated config
							const finalConfig = yield* validate(
								plugin.configSchema,
								hydratedConfig,
								plugin.id,
								"config",
							).pipe(
								Effect.mapError(
									(validationError): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "validate-hydrated-config",
											cause: validationError.zodError,
											retryable: false,
										}),
								),
							);

							// Initialize plugin with retry logic
							const pluginLayer = Layer.succeed(PluginLoggerTag, logger);
							yield* plugin.initialize(finalConfig).pipe(
								Effect.mapError(
									(error): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "initialize-plugin",
											cause: error,
											retryable: error.retryable ?? false,
										}),
								),
								Effect.retry(
									retrySchedule.pipe(
										Schedule.whileInput(
											(error: PluginRuntimeError) => error.retryable,
										),
									),
								),
								Effect.provide(pluginLayer),
							);

							return {
								plugin,
								metadata: pluginInstance.metadata,
								config: finalConfig as any, // TODO: config type
							} satisfies InitializedPlugin<T>;
						}),

					executePlugin: <T extends AnyPlugin>(
						initializedPlugin: InitializedPlugin<T>,
						input: unknown,
					) =>
						Effect.gen(function* () {
							const { plugin } = initializedPlugin;

							// Validate input
							const validatedInput = yield* validate(
								plugin.inputSchema,
								input,
								plugin.id,
								"input",
							).pipe(
								Effect.mapError(
									(validationError): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "validate-input",
											cause: validationError.zodError,
											retryable: false,
										}),
								),
							);

							// Execute plugin
							const pluginLayer = Layer.succeed(PluginLoggerTag, logger);
							const output = yield* plugin.execute(validatedInput).pipe(
								Effect.mapError(
									(error): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "execute-plugin",
											cause: error,
											retryable: error.retryable ?? false,
										}),
								),
								Effect.retry(
									retrySchedule.pipe(
										Schedule.whileInput(
											(error: PluginRuntimeError) => error.retryable,
										),
									),
								),
								Effect.provide(pluginLayer),
							);

							// Validate output
							const validatedOutput = yield* validate(
								plugin.outputSchema,
								output,
								plugin.id,
								"output",
							).pipe(
								Effect.mapError(
									(validationError): PluginRuntimeError =>
										new PluginRuntimeError({
											pluginId: plugin.id,
											operation: "validate-output",
											cause: validationError.zodError,
											retryable: false,
										}),
								),
							);

							return validatedOutput;
						}),
				};
			}),
		);
}

export const PluginServiceTag = PluginService;
export const PluginServiceLive = PluginService.Live;
