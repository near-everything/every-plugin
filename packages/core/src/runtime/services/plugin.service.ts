import type { AnySchema, ErrorMap, Meta } from "@orpc/contract";
import { call, type Context as OContext, type Procedure } from "@orpc/server";
import { Cache, Duration, Effect, Hash, Layer, Schedule, type Stream } from "effect";
import type { z } from "zod";
import { type Contract, type Plugin, PluginLoggerTag, type PluginRegistry } from "../../plugin";
import { PluginRuntimeError } from "../errors";
import { createSourceStream, type StreamingOptions } from "../streaming";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	SecretsConfig,
} from "../types";
import { validate } from "../validation";
import { ModuleFederationService } from "./module-federation.service";
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
		input: z.infer<T["inputSchema"]>,
	) => Effect.Effect<z.infer<T["outputSchema"]>, PluginRuntimeError>;
	readonly usePlugin: <T extends AnyPlugin>(
		pluginId: string,
		config: unknown,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly streamPlugin: <
		T extends Plugin<Contract>,
		TInput extends z.infer<T["inputSchema"]> = z.infer<T["inputSchema"]>,
		TItem = unknown,
		TPluginState extends z.infer<T["stateSchema"]> = z.infer<T["stateSchema"]>
	>(
		pluginId: string,
		config: z.infer<T["configSchema"]>,
		input: TInput,
		options?: StreamingOptions<TItem, TPluginState>
	) => Effect.Effect<Stream.Stream<TItem, PluginRuntimeError>, PluginRuntimeError>;
	readonly shutdownPlugin: (plugin: InitializedPlugin<AnyPlugin>) => Effect.Effect<void, PluginRuntimeError>;
	readonly clearCache: () => Effect.Effect<void, never>;
	readonly cleanup: () => Effect.Effect<void, never>;
}

export class PluginService extends Effect.Tag("PluginService")<
	PluginService,
	IPluginService
>() {
	static Live = (registry: PluginRegistry, secrets: SecretsConfig) =>
		Layer.effect(
			PluginService,
			Effect.gen(function* () {
				const moduleFederationService = yield* ModuleFederationService;
				const secretsService = yield* SecretsService;
				const logger = yield* PluginLoggerTag;

				const activePlugins = new Set<InitializedPlugin<AnyPlugin>>();

				const retrySchedule = Schedule.exponential(Duration.millis(100)).pipe(
					Schedule.compose(Schedule.recurs(2)),
				);

				const resolveUrl = (baseUrl: string, version?: string): string =>
					version && version !== "latest"
						? baseUrl.replace("@latest", `@${version}`)
						: baseUrl;

				// Implementation functions
				const loadPluginImpl = (pluginId: string) =>
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

						// Register and load the remote constructor
						yield* moduleFederationService.registerRemote(pluginId, url).pipe(
							Effect.mapError((error) =>
								new PluginRuntimeError({
									pluginId,
									operation: "register-remote",
									cause: error.cause,
									retryable: true,
								})
							)
						);
						logger.logDebug(`Trying to load ${pluginId}:${url}`)
						const ctor = yield* moduleFederationService.loadRemoteConstructor(pluginId, url).pipe(
							Effect.mapError((error) =>
								new PluginRuntimeError({
									pluginId,
									operation: "load-remote",
									cause: error.cause,
									retryable: false
								})
							)
						);

						return {
							ctor,
							metadata: {
								pluginId,
								version: metadata.version,
								description: metadata.description,
								type: metadata.type,
							},
						} satisfies PluginConstructor;
					});

				const instantiatePluginImpl = <T extends AnyPlugin>(
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
					});

				const initializePluginImpl = <T extends AnyPlugin>(
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

						const initializedPlugin = {
							plugin,
							metadata: pluginInstance.metadata,
							config: finalConfig as any, // TODO: config type
						} satisfies InitializedPlugin<T>;

						activePlugins.add(initializedPlugin as InitializedPlugin<AnyPlugin>);

						return initializedPlugin;
					});

				// Cache functionality
				const generateConfigHash = (config: unknown): string => {
					return Hash.structure(config as object).toString();
				};

				// Store original config by hash for cache lookup
				const configByHash = new Map<string, unknown>();

				const cache = yield* Cache.make<
					string, // Key format: "pluginId:configHash"
					InitializedPlugin<AnyPlugin>,
					PluginRuntimeError
				>({
					capacity: 1024,
					timeToLive: Duration.minutes(60),
					lookup: (cacheKey: string) => {
						const [pluginId, configHash] = cacheKey.split(':');

						if (!pluginId || !configHash) {
							return Effect.fail(new PluginRuntimeError({
								operation: "cache-lookup",
								cause: new Error(`Invalid cache key format: ${cacheKey}`),
								retryable: false,
							}));
						}

						const config = configByHash.get(configHash);

						if (!config) {
							return Effect.fail(new PluginRuntimeError({
								operation: "cache-lookup",
								cause: new Error(`No config found for hash: ${configHash}`),
								retryable: false,
							}));
						}

						return Effect.gen(function* () {
							const ctor = yield* loadPluginImpl(pluginId);
							const instance = yield* instantiatePluginImpl(ctor);
							return yield* initializePluginImpl(instance, config);
						});
					},
				});


				const usePluginImpl = <T extends AnyPlugin>(
					pluginId: string,
					config: unknown,
				): Effect.Effect<InitializedPlugin<T>, PluginRuntimeError> => {
					const configHash = generateConfigHash(config);
					const cacheKey = `${pluginId}:${configHash}`;

					// Store config for cache lookup
					configByHash.set(configHash, config);

					return cache.get(cacheKey).pipe(
						Effect.map(plugin => plugin as InitializedPlugin<T>)
					);
				};

				// Extract executePlugin implementation for reuse
				const executePluginImpl = <T extends AnyPlugin>(
					initializedPlugin: InitializedPlugin<T>,
					input: z.infer<T["inputSchema"]>,
				): Effect.Effect<z.infer<T["outputSchema"]>, PluginRuntimeError> =>
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
								(validationError): PluginRuntimeError => {
									return new PluginRuntimeError({
										pluginId: plugin.id,
										operation: "validate-input",
										cause: validationError.zodError,
										retryable: false,
									});
								},
							),
						);

						// Get oRPC router and call procedure directly
						const router = plugin.createRouter();
						const procedureName = (validatedInput as z.infer<T["inputSchema"]>).procedure as string;

						if (!(procedureName in router)) {
							return yield* Effect.fail(
								new PluginRuntimeError({
									pluginId: plugin.id,
									operation: "execute-plugin",
									cause: new Error(`Unknown procedure: ${procedureName}`),
									retryable: false,
								})
							);
						}

						const context = 'state' in validatedInput ? { state: validatedInput.state } : {};
						const output = yield* Effect.tryPromise({
							try: () => {
								const procedure = router[procedureName as keyof typeof router] as Procedure<OContext, OContext, AnySchema, AnySchema, ErrorMap, Meta>;;

								if (!procedure) {
									throw new Error(`Procedure ${procedureName} not found in router`);
								}

								// Use oRPC call utility as per docs
								return call(procedure, validatedInput.input, { context });
							},
							catch: (error): PluginRuntimeError =>
								new PluginRuntimeError({
									pluginId: plugin.id,
									operation: "execute-plugin",
									cause: error instanceof Error ? error : new Error(String(error)),
									retryable: true,
								}),
						}).pipe(
							Effect.retry(
								retrySchedule.pipe(
									Schedule.whileInput(
										(error: PluginRuntimeError) => error.retryable,
									),
								),
							),
						);

						return output as z.infer<T["outputSchema"]>;
					});

				return {
					loadPlugin: loadPluginImpl,
					instantiatePlugin: instantiatePluginImpl,
					initializePlugin: initializePluginImpl,
					executePlugin: executePluginImpl,
					usePlugin: usePluginImpl,
					streamPlugin: <
						T extends Plugin<Contract>,
						TInput extends z.infer<T["inputSchema"]> = z.infer<T["inputSchema"]>,
						TItem = unknown,
						TPluginState extends z.infer<T["stateSchema"]> = z.infer<T["stateSchema"]>
					>(
						pluginId: string,
						config: z.infer<T["configSchema"]>,
						input: TInput,
						options?: StreamingOptions<TItem, TPluginState>
					): Effect.Effect<Stream.Stream<TItem, PluginRuntimeError>, PluginRuntimeError> => Effect.gen(function* () {

						const initializedPlugin = yield* usePluginImpl<T>(pluginId, config);

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
						return createSourceStream<T, TInput, TItem, TPluginState>(
							initializedPlugin,
							executePluginImpl,
							input,
							options
						);
					}),
					shutdownPlugin: (plugin: InitializedPlugin<AnyPlugin>) =>
						Effect.gen(function* () {
							const pluginLayer = Layer.succeed(PluginLoggerTag, logger);

							// Remove from active plugins
							activePlugins.delete(plugin);

							// Try to invalidate from cache if it exists there
							const configHash = generateConfigHash(plugin.config);
							const cacheKey = `${plugin.plugin.id}:${configHash}`;

							yield* cache.invalidate(cacheKey).pipe(
								Effect.catchAll(() => Effect.void) // Ignore if not in cache
							);

							// Clean up config hash
							configByHash.delete(configHash);

							// Shutdown the plugin
							yield* plugin.plugin.shutdown().pipe(
								Effect.mapError((error): PluginRuntimeError =>
									new PluginRuntimeError({
										pluginId: plugin.plugin.id,
										operation: "shutdown-plugin",
										cause: error,
										retryable: false,
									})
								),
								Effect.provide(pluginLayer)
							);
						}),
					clearCache: () =>
						Effect.sync(() => {
							configByHash.clear();
						}),
					cleanup: () =>
						Effect.gen(function* () {
							const pluginLayer = Layer.succeed(PluginLoggerTag, logger);

							// Call shutdown on all active plugins
							for (const initializedPlugin of activePlugins) {
								yield* initializedPlugin.plugin.shutdown().pipe(
									Effect.catchAll((error) => {
										// Log shutdown errors but don't fail the cleanup
										return logger.logError(
											`Failed to shutdown plugin ${initializedPlugin.plugin.id}`,
											error,
											{ pluginId: initializedPlugin.plugin.id }
										);
									}),
									Effect.provide(pluginLayer)
								);
							}

							// Clear the active plugins set
							activePlugins.clear();
							// Clear cache
							configByHash.clear();
						}),
				};
			}),
		);
}

export const PluginServiceTag = PluginService;
export const PluginServiceLive = PluginService.Live;
