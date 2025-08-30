import type {
	Config,
	Plugin,
	PluginExecutionError,
	PluginMetadata,
} from "every-plugin";
import { type ConfigurationError, PluginLoggerTag } from "every-plugin";
import { Cache, Context, Duration, Effect, Layer, Schedule } from "effect";
import type z from "zod";
import registryData from "../../../../packages/registry/registry.json" with {
	type: "json",
};
import { PluginError } from "../pipeline/errors";
import { SchemaValidator } from "../pipeline/validation";
import { EnvironmentServiceTag } from "./env.service";
import { ModuleFederationTag } from "./mf.service";

type PipelinePlugin = Plugin<z.ZodTypeAny, z.ZodTypeAny, z.ZodTypeAny>;

export interface PluginService {
	readonly initializePlugin: <
		T extends Plugin<z.ZodTypeAny, z.ZodTypeAny, z.ZodTypeAny>,
	>(
		pluginConfig: { pluginId: string; config: z.ZodTypeAny },
		contextDescription: string,
	) => Effect.Effect<T, PluginError>;

	readonly executePlugin: <
		TInputSchema extends z.ZodTypeAny,
		TOutputSchema extends z.ZodTypeAny,
		TConfigSchema extends z.ZodTypeAny,
	>(
		plugin: Plugin<TInputSchema, TOutputSchema, TConfigSchema>,
		input: z.infer<TInputSchema>,
		contextDescription: string,
	) => Effect.Effect<z.infer<TOutputSchema>, PluginError>;
}

export class PluginServiceTag extends Context.Tag("PluginService")<
	PluginServiceTag,
	PluginService
>() {}

const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(
	Schedule.compose(Schedule.recurs(2)),
);

const loadModuleInternal = (
	pluginId: string,
	url: string,
): Effect.Effect<new () => PipelinePlugin, PluginError, ModuleFederationTag> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () => fetch(url, { method: "HEAD" }),
			catch: (): PluginError =>
				new PluginError({
					message: `Network error while fetching plugin ${pluginId} from ${url}`,
					pluginId,
					operation: "load",
					// cause: error,
				}),
		});

		if (!response.ok) {
			return yield* Effect.fail(
				new PluginError({
					message: `Plugin ${pluginId} not found at ${url}`,
					pluginId,
					operation: "load",
					retryable: false,
				}),
			);
		}

		const mf = yield* ModuleFederationTag;
		const remoteName = pluginId
			.toLowerCase()
			.replace("@", "")
			.replace("/", "_");

		yield* Effect.try({
			try: () => mf.registerRemotes([{ name: remoteName, entry: url }]),
			catch: (error): PluginError =>
				new PluginError({
					message: `Failed to register ${pluginId}`,
					pluginId,
					operation: "register",
					cause: error instanceof Error ? error : new Error(String(error)),
				}),
		});

		const modulePath = `${remoteName}/plugin`;

		return yield* Effect.tryPromise({
			try: async () => {
				const container: any = mf.loadRemote(modulePath).then((container) => {
					if (!container) {
						throw new Error(`No container returned for ${modulePath}`);
					}

					const Constructor =
						typeof container === "function"
							? container
							: (container as any)?.default;

					if (!Constructor || typeof Constructor !== "function") {
						throw new Error(
							`No valid constructor found. Container type: ${typeof container}, has default: ${!!(container as any)?.default}`,
						);
					}

					return Constructor;
				});
				return container;
			},
			catch: (error): PluginError => {
				if (error instanceof PluginError) {
					return error;
				}

				return new PluginError({
					message: `Failed to load ${pluginId} from ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
					pluginId,
					operation: "load",
					// cause: error instanceof Error ? error : new Error(String(error)),
				});
			},
		});
	});

export const createPluginCache = (): Effect.Effect<
	Cache.Cache<string, new () => PipelinePlugin, PluginError>,
	never,
	ModuleFederationTag
> =>
	Cache.make({
		capacity: 50,
		timeToLive: Duration.minutes(30),
		lookup: (
			cacheKey: string,
		): Effect.Effect<
			new () => PipelinePlugin,
			PluginError,
			ModuleFederationTag
		> => {
			// Parse cache key: "pluginId:url"
			const colonIndex = cacheKey.indexOf(":");
			if (colonIndex === -1) {
				return Effect.fail(
					new PluginError({
						message: `Invalid cache key format: ${cacheKey}`,
						pluginId: cacheKey,
						operation: "load",
						retryable: false,
					}),
				);
			}

			const pluginId = cacheKey.substring(0, colonIndex);
			const url = cacheKey.substring(colonIndex + 1);

			return loadModuleInternal(pluginId, url);
		},
	});

const resolveUrl = (baseUrl: string, version?: string): string =>
	version && version !== "latest"
		? baseUrl.replace("@latest", `@${version}`)
		: baseUrl;

const getPluginMetadata = (pluginId: string): PluginMetadata | undefined =>
	(registryData as any)[pluginId];

// Helper for getting plugin metadata
export const getPlugin = (
	pluginId: string,
): Effect.Effect<PluginMetadata, PluginError> =>
	Effect.gen(function* () {
		const plugin = getPluginMetadata(pluginId);
		if (!plugin) {
			return yield* Effect.fail(
				new PluginError({
					message: `Plugin ${pluginId} not found in registry`,
					pluginId,
					operation: "load",
				}),
			);
		}
		return plugin;
	});

export const PluginServiceLive = Layer.effect(
	PluginServiceTag,
	Effect.gen(function* () {
		const moduleCache = yield* createPluginCache();
		const environmentService = yield* EnvironmentServiceTag;
		const logger = yield* PluginLoggerTag;

		// This is the original `loadPlugin` function, now used internally
		const loadAndInstantiate =
			(getPluginMetadata: (name: string) => PluginMetadata | undefined) =>
			<TConfig extends Config>(
				pluginId: string,
				config?: TConfig,
				version?: string,
			): Effect.Effect<Plugin<any, any, any>, PluginError> => {
				// Get metadata or fail
				const getMetadata: Effect.Effect<PluginMetadata, PluginError> =
					Effect.sync(() => {
						const metadata = getPluginMetadata(pluginId);
						if (!metadata) {
							throw new PluginError({
								message: `Plugin ${pluginId} not found`,
								pluginId,
								operation: "load",
							});
						}
						return metadata;
					});

				// Build cache key
				const getCacheKey = getMetadata.pipe(
					Effect.map((metadata) => ({
						metadata,
						url: resolveUrl(metadata.remoteUrl, version),
						cacheKey: `${pluginId}:${resolveUrl(metadata.remoteUrl, version)}`,
					})),
				);

				// Get constructor from cache
				const getConstructor: Effect.Effect<
					new () => PipelinePlugin,
					PluginError
				> = getCacheKey.pipe(
					Effect.flatMap(({ cacheKey }) =>
						moduleCache.get(cacheKey).pipe(
							Effect.mapError((error): PluginError => {
								if (error instanceof PluginError) {
									return error;
								}
								return new PluginError({
									message: `Cache error for ${pluginId}`,
									pluginId,
									operation: "load",
									cause: error,
								});
							}),
						),
					),
				);

				// Create and initialize instance
				const createAndInitialize: Effect.Effect<PipelinePlugin, PluginError> =
					getConstructor.pipe(
						Effect.flatMap((PluginConstructor: new () => PipelinePlugin) =>
							// Create instance
							Effect.try({
								try: () => new PluginConstructor(),
								catch: (error) =>
									new PluginError({
										message: `Failed to instantiate plugin: ${pluginId}`,
										pluginId,
										operation: "load",
										cause: error,
									}),
							}).pipe(
								// Initialize with retry
								Effect.flatMap((instance) => {
									// Validate that the plugin ID matches
									if (instance.id !== pluginId) {
										return Effect.fail(
											new PluginError({
												message: `Plugin ID mismatch: expected ${pluginId}, got ${instance.id}`,
												pluginId,
												operation: "initialize",
												retryable: false,
											}),
										);
									}

									const pluginLayer = Layer.succeed(PluginLoggerTag, logger);

									const initialize: Effect.Effect<void, PluginError> = instance
										.initialize(config)
										.pipe(
											Effect.mapError(
												(error: ConfigurationError): PluginError => {
													return new PluginError({
														message: `Configuration error in ${pluginId}: ${error.message}`,
														pluginId,
														operation: "initialize",
														cause: error,
														retryable: error.retryable,
													});
												},
											),
											Effect.catchAll((pluginError) => {
												if (pluginError.retryable) {
													return Effect.fail(pluginError).pipe(
														Effect.retry(retrySchedule),
													);
												}
												return Effect.fail(pluginError);
											}),
											Effect.provide(pluginLayer),
										);

									// Return instance after successful initialization
									return initialize.pipe(Effect.map(() => instance));
								}),
							),
						),
					);

				return createAndInitialize;
			};

		const internalPluginLoader = loadAndInstantiate(getPluginMetadata);

		return {
			initializePlugin: <T extends Plugin<any, any, any>>(
				pluginConfig: { pluginId: string; config: any },
				contextDescription: string,
			): Effect.Effect<T, PluginError> =>
				Effect.gen(function* () {
					const { pluginId, config } = pluginConfig;
					const pluginMetadata = yield* getPlugin(pluginId);

					yield* logger.logInfo(`Initializing plugin ${pluginId}`);

					const validatedRawConfig = yield* SchemaValidator.validate(
						pluginMetadata.configSchema,
						config,
						`${contextDescription} raw config`,
					).pipe(
						Effect.mapError(
							(validationError) =>
								new PluginError({
									message: `Config validation failed: ${validationError.message}`,
									pluginId,
									operation: "validate",
									cause: validationError,
									retryable: false,
								}),
						),
					);

					const hydratedConfig = yield* environmentService
						.hydrateSecrets(validatedRawConfig, pluginMetadata.configSchema)
						.pipe(
							Effect.mapError(
								(environmentError) =>
									new PluginError({
										message: `Secret hydration failed: ${environmentError.message}`,
										pluginId,
										operation: "hydrate-secrets",
										cause: environmentError,
										retryable: false,
									}),
							),
						);

					const finalValidatedConfig = yield* SchemaValidator.validate(
						pluginMetadata.configSchema,
						hydratedConfig,
						`${contextDescription} hydrated config`,
					).pipe(
						Effect.mapError(
							(validationError) =>
								new PluginError({
									message: `Hydrated config validation failed: ${validationError.message}`,
									pluginId,
									operation: "validate",
									cause: validationError,
									retryable: false,
								}),
						),
					);

					// Now, load and initialize
					const plugin = yield* internalPluginLoader(
						pluginId,
						finalValidatedConfig,
					);

					yield* logger.logDebug(
						`Successfully initialized plugin ${pluginId}`,
						{ contextDescription },
					);

					return plugin as T;
				}),

			executePlugin: <
				TInputSchema extends z.ZodTypeAny,
				TOutputSchema extends z.ZodTypeAny,
				TConfigSchema extends z.ZodTypeAny,
			>(
				plugin: Plugin<TInputSchema, TOutputSchema, TConfigSchema>,
				input: z.infer<TInputSchema>,
				contextDescription: string,
			): Effect.Effect<z.infer<TOutputSchema>, PluginError> =>
				Effect.gen(function* () {
					yield* logger.logDebug(`Executing plugin ${plugin.id}`, {
						contextDescription,
					});

					const pluginMetadata = yield* getPlugin(plugin.id);

					const validatedInput = yield* SchemaValidator.validate(
						pluginMetadata.inputSchema,
						input as Record<string, unknown>,
						`${contextDescription} input`,
					).pipe(
						Effect.mapError(
							(validationError) =>
								new PluginError({
									message: `Input validation failed: ${validationError.message}`,
									pluginId: plugin.id,
									operation: "validate",
									cause: validationError,
									retryable: false,
								}),
						),
					);

					const pluginLayer = Layer.succeed(PluginLoggerTag, logger);

					const output = yield* plugin
						.execute(validatedInput as z.infer<TInputSchema>)
						.pipe(
							Effect.provide(pluginLayer),
							Effect.mapError(
								(error: PluginExecutionError) =>
									new PluginError({
										message: `Plugin execution failed: ${error.message}`,
										pluginId: plugin.id,
										operation: "execute",
										cause: error,
										retryable: error.retryable,
									}),
							),
							Effect.retry(
								retrySchedule.pipe(
									Schedule.whileInput(
										(error: PluginError) => error.retryable ?? false,
									),
								),
							),
						);

					const validatedOutput = yield* SchemaValidator.validate(
						pluginMetadata.outputSchema,
						output as Record<string, unknown>,
						`${contextDescription} output`,
					).pipe(
						Effect.mapError(
							(validationError) =>
								new PluginError({
									message: `Output validation failed: ${validationError.message}`,
									pluginId: plugin.id,
									operation: "validate",
									cause: validationError,
									retryable: false,
								}),
						),
					);

					yield* logger.logInfo(`Successfully executed plugin ${plugin.id}`, {
						contextDescription,
						outputSize: JSON.stringify(validatedOutput).length,
					});

					return validatedOutput as z.infer<TOutputSchema>;
				}),
		};
	}),
);
