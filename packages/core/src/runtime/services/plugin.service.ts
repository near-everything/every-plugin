import { Cache, Context, Duration, Effect, Exit, Hash, Layer, Ref, Scope } from "effect";
import type { z } from "zod";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRegistry,
	SecretsConfig
} from "../../types";
import { PluginRuntimeError } from "../errors";
import { validate } from "../validation";
import { PluginLifecycleService } from "./plugin-lifecycle.service";
import { PluginLoaderService } from "./plugin-loader.service";

export interface IPluginService {
	readonly loadPlugin: (
		pluginId: string,
	) => Effect.Effect<PluginConstructor<AnyPlugin>, PluginRuntimeError>;
	readonly instantiatePlugin: <T extends AnyPlugin>(
		pluginConstructor: PluginConstructor<T>,
	) => Effect.Effect<PluginInstance<T>, PluginRuntimeError>;
	readonly initializePlugin: <T extends AnyPlugin>(
		pluginInstance: PluginInstance<T>,
		config: z.infer<T["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly usePlugin: <T extends AnyPlugin = AnyPlugin>(
		pluginId: string,
		config: z.infer<T["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
	readonly shutdownPlugin: (plugin: InitializedPlugin<AnyPlugin>) => Effect.Effect<void, PluginRuntimeError>;
	readonly cleanup: () => Effect.Effect<void, never>;
}

export class PluginService extends Context.Tag("PluginService")<
	PluginService,
	IPluginService
>() {
	static Live = (registry: PluginRegistry, secrets: SecretsConfig) =>
		Layer.scoped(
			PluginService,
			Effect.gen(function* () {
				// Inject all specialized services via Context.Tag
				const loader = yield* PluginLoaderService;
				const lifecycle = yield* PluginLifecycleService;

				// Cache setup helpers
				const generateConfigHash = (config: unknown): string => {
					return Hash.structure(config as object).toString();
				};

				const generateCacheKey = (pluginId: string, config: unknown): string => {
					const configHash = generateConfigHash(config);
					return `${pluginId}:${configHash}`;
				};

				// Store original config by hash for cache lookup
				const configByHash = yield* Ref.make(new Map<string, { config: unknown; pluginId: string }>());

				// Cache lookup function
				const getCachedPlugin = (pluginId: string, config: unknown) =>
					Effect.gen(function* () {
						// Load, instantiate plugin to get schema for validation
						const ctor = yield* loader.loadPlugin(pluginId);
						const instance = yield* loader.instantiatePlugin(ctor);

						// Re-validate cached config against plugin's schema to ensure type safety
						const validatedConfig = yield* validate(
							instance.plugin.configSchema,
							config,
							pluginId,
							"config",
						).pipe(
							Effect.mapError((validationError) =>
								new PluginRuntimeError({
									pluginId,
									operation: "validate-config",
									cause: validationError.zodError,
									retryable: false,
								}),
							),
						);

						// Initialize with properly validated config
						const initialized = yield* loader.initializePlugin(instance, validatedConfig);

						// Register for lifecycle management on first creation
						yield* lifecycle.register(initialized);

						return initialized;
					});

				// Cache with lookup
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
								pluginId: pluginId || "unknown",
								operation: "cache-lookup",
								cause: new Error(`Invalid cache key format: ${cacheKey}`),
								retryable: false,
							}));
						}

						return Effect.gen(function* () {
							const configMap = yield* Ref.get(configByHash);
							const configEntry = configMap.get(configHash);

							if (!configEntry) {
								return yield* Effect.fail(new PluginRuntimeError({
									pluginId,
									operation: "cache-lookup",
									cause: new Error(`No config found for hash: ${configHash}`),
									retryable: false,
								}));
							}

							// Verify pluginId matches to ensure cache integrity
							if (configEntry.pluginId !== pluginId) {
								return yield* Effect.fail(new PluginRuntimeError({
									pluginId,
									operation: "cache-lookup",
									cause: new Error(`Plugin ID mismatch in cache: expected ${pluginId}, got ${configEntry.pluginId}`),
									retryable: false,
								}));
							}

							return yield* getCachedPlugin(pluginId, configEntry.config);
						});
					},
				});

				return {
					// Delegate to specialized services
					loadPlugin: loader.loadPlugin,
					instantiatePlugin: loader.instantiatePlugin,
					initializePlugin: loader.initializePlugin,
					usePlugin: <T extends AnyPlugin = AnyPlugin>(pluginId: string, config: z.infer<T["configSchema"]>) =>
						Effect.gen(function* () {
							const cacheKey = generateCacheKey(pluginId, config);
							const configHash = generateConfigHash(config);

							// Store config with plugin ID for type-safe cache lookup
							yield* Ref.update(configByHash, map =>
								new Map(map).set(configHash, { config, pluginId })
							);

							// Get from cache (will trigger lookup on miss)
							const initialized = yield* cache.get(cacheKey);

							// Type assertion is safe here because:
							// 1. Cache lookup validates config against plugin's schema
							// 2. Plugin ID is verified in cache lookup
							// 3. The generic T is constrained by the caller's type system
							return initialized as InitializedPlugin<T>;
						}),
					shutdownPlugin: (plugin: InitializedPlugin<AnyPlugin>) =>
						Effect.gen(function* () {
							// Shutdown the plugin first (graceful cleanup)
							yield* plugin.plugin.shutdown().pipe(
								Effect.catchAll(() => Effect.void)
							);

							// Close the plugin scope to interrupt fibers and release resources
							yield* Scope.close(plugin.scope, Exit.succeed(undefined));

							// Unregister from lifecycle tracking
							yield* lifecycle.unregister(plugin);
						}),
					cleanup: lifecycle.cleanup,
				};
			}),
		).pipe(
			// Provide all service dependencies using Layer composition
			Layer.provide(
				Layer.mergeAll(
					PluginLoaderService.Live(registry, secrets),
					PluginLifecycleService.Live,
				),
			),
		);
}

export const PluginServiceTag = PluginService;
export const PluginServiceLive = PluginService.Live;
