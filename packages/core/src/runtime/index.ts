import { Context, Effect, Hash, Layer, ManagedRuntime } from "effect";
import type { z } from "zod";
import { createPluginClient, getPluginRouter } from "../client/index";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginOf,
	PluginRegistry,
	PluginResult,
	PluginRuntimeConfig,
	RegistryBindings,
	RuntimeOptions,
	SecretsConfig
} from "../types";
import { PluginRuntimeError } from "./errors";
import { SecretsService } from "./services";
import { ModuleFederationService } from "./services/module-federation.service";
import { type IPluginService, PluginService } from "./services/plugin.service";

export interface IPluginRuntime<R extends RegistryBindings = RegistryBindings> {
	readonly loadPlugin: <K extends keyof R>(
		pluginId: K,
	) => Effect.Effect<PluginConstructor<PluginOf<R[K]>>, PluginRuntimeError>;

	readonly instantiatePlugin: <K extends keyof R>(
		ctor: PluginConstructor<PluginOf<R[K]>>,
	) => Effect.Effect<PluginInstance<PluginOf<R[K]>>, PluginRuntimeError>;

	readonly initializePlugin: <K extends keyof R>(
		instance: PluginInstance<PluginOf<R[K]>>,
		config: z.infer<PluginOf<R[K]>["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<PluginOf<R[K]>>, PluginRuntimeError>;

	readonly usePlugin: <K extends keyof R>(
		pluginId: K,
		config: z.infer<PluginOf<R[K]>["configSchema"]>,
	) => Effect.Effect<PluginResult<PluginOf<R[K]>>, PluginRuntimeError>;

	readonly shutdown: () => Effect.Effect<void, never, never>;
}
export class PluginRuntimeImpl<R extends RegistryBindings = RegistryBindings> implements IPluginRuntime<R> {
	private pluginCache = new Map<string, Effect.Effect<PluginResult<AnyPlugin>, PluginRuntimeError>>();

	constructor(
		private pluginService: IPluginService,
		private registry: PluginRegistry
	) { }

	private generateCacheKey(pluginId: string, config: unknown): string {
		const configHash = Hash.structure(config as object).toString();
		return `${pluginId}:${configHash}`;
	}

	private validatePluginId<K extends keyof R>(pluginId: K): Effect.Effect<string, PluginRuntimeError> {
		const pluginIdStr = pluginId as string;

		// Runtime validation against registry
		if (!(pluginIdStr in this.registry)) {
			return Effect.fail(new PluginRuntimeError({
				pluginId: pluginIdStr,
				operation: "validate-plugin-id",
				cause: new Error(`Plugin ID '${pluginIdStr}' not found in registry`),
				retryable: false,
			}));
		}

		return Effect.succeed(pluginIdStr);
	}

	loadPlugin<K extends keyof R>(pluginId: K): Effect.Effect<PluginConstructor<PluginOf<R[K]>>, PluginRuntimeError> {
		const self = this;
		return Effect.gen(function* () {
			const validatedId = yield* self.validatePluginId(pluginId);
			const result = yield* self.pluginService.loadPlugin(validatedId);
			return result as PluginConstructor<PluginOf<R[K]>>;
		});
	}

	instantiatePlugin<K extends keyof R>(ctor: PluginConstructor<PluginOf<R[K]>>): Effect.Effect<PluginInstance<PluginOf<R[K]>>, PluginRuntimeError> {
		const self = this;
		return Effect.gen(function* () {
			const result = yield* self.pluginService.instantiatePlugin(ctor as PluginConstructor<AnyPlugin>);
			return result as PluginInstance<PluginOf<R[K]>>;
		});
	}

	initializePlugin<K extends keyof R>(
		instance: PluginInstance<PluginOf<R[K]>>,
		config: z.infer<PluginOf<R[K]>["configSchema"]>
	): Effect.Effect<InitializedPlugin<PluginOf<R[K]>>, PluginRuntimeError> {
		const self = this;
		return Effect.gen(function* () {
			const result = yield* self.pluginService.initializePlugin(
				instance as PluginInstance<AnyPlugin>,
				config
			);
			return result as InitializedPlugin<PluginOf<R[K]>>;
		});
	}

	usePlugin<K extends keyof R>(
		pluginId: K,
		config: z.infer<PluginOf<R[K]>["configSchema"]>
	): Effect.Effect<PluginResult<PluginOf<R[K]>>, PluginRuntimeError> {
		const cacheKey = this.generateCacheKey(String(pluginId), config);

		let cachedPlugin = this.pluginCache.get(cacheKey);
		if (!cachedPlugin) {
			const self = this;
			const operation = Effect.gen(function* () {
				const validatedId = yield* self.validatePluginId(pluginId);

				// Load → Instantiate → Initialize
				const ctor = yield* self.pluginService.loadPlugin(validatedId);
				const instance = yield* self.pluginService.instantiatePlugin(ctor);
				const initialized = yield* self.pluginService.initializePlugin(instance, config);

				const client = createPluginClient(initialized);
				const router = getPluginRouter(initialized);

				return {
					client,
					router,
					metadata: initialized.metadata,
					initialized
				};
			});

			cachedPlugin = Effect.cached(operation).pipe(Effect.flatten);
			this.pluginCache.set(cacheKey, cachedPlugin);
		}

		return cachedPlugin as Effect.Effect<PluginResult<PluginOf<R[K]>>, PluginRuntimeError>;
	}

	shutdown(): Effect.Effect<void, never, never> {
		return this.pluginService.cleanup();
	}

	/**
	 * Evict a plugin from cache and shutdown its instance
	 */
	evictPlugin<K extends keyof R>(
		pluginId: K,
		config: z.infer<PluginOf<R[K]>["configSchema"]>
	): Effect.Effect<void, never> {
		const cacheKey = this.generateCacheKey(String(pluginId), config);
		const self = this;

		return Effect.gen(function* () {
			// Get cached plugin if it exists
			const cachedPlugin = self.pluginCache.get(cacheKey);

			if (cachedPlugin) {
				// Remove from cache first
				self.pluginCache.delete(cacheKey);

				// Try to shutdown the plugin gracefully
				const pluginResult = yield* cachedPlugin.pipe(Effect.catchAll(() => Effect.succeed(null)));

				if (pluginResult?.initialized) {
					yield* self.pluginService.shutdownPlugin(pluginResult.initialized).pipe(
						Effect.catchAll(() => Effect.void) // Ignore shutdown errors during eviction
					);
				}
			}
		}).pipe(
			Effect.catchAll(() => Effect.void) // Never fail
		);
	}
}

export class PluginRuntimeService extends Context.Tag("PluginRuntimeService")<
	PluginRuntimeService,
	IPluginService
>() {
	static Live = <R extends RegistryBindings = RegistryBindings>(config: PluginRuntimeConfig<R>) => {
		const secrets = config.secrets || {};

		return Layer.scoped(
			PluginRuntimeService,
			Effect.gen(function* () {
				const pluginService = yield* PluginService;

				// Register cleanup finalizer for automatic resource management
				yield* Effect.addFinalizer(() =>
					pluginService.cleanup().pipe(
						Effect.catchAll(() => Effect.void) // Ensure cleanup never fails
					)
				);

				return pluginService;
			}),
		).pipe(
			Layer.provide(
				PluginService.Live(config.registry, secrets).pipe(
					Layer.provide(
						Layer.mergeAll(
							ModuleFederationService.Live,
							SecretsService.Live(secrets),
						),
					),
				),
			),
		);
	}
}

/**
 * Creates a typed plugin runtime with compile-time registry key validation.
 */
export function createPluginRuntime<R extends RegistryBindings = RegistryBindings>(
	config: { registry: PluginRegistry; secrets?: SecretsConfig; options?: RuntimeOptions }
) {
	const runtimeConfig: PluginRuntimeConfig<R> = {
		registry: config.registry,
		secrets: config.secrets,
		options: config.options
	};

	const runtime = ManagedRuntime.make(PluginRuntimeService.Live(runtimeConfig));

	const createTypedRuntime: Effect.Effect<PluginRuntimeImpl<R>, never, never> = Effect.gen(function* () {
		const pluginService = yield* PluginRuntimeService;
		return new PluginRuntimeImpl<R>(pluginService, runtimeConfig.registry);
	}).pipe(Effect.provide(runtime));

	return { runtime, PluginRuntime: createTypedRuntime };
}

export type {
	ConfigOf,
	InitializedPlugin,
	PluginOf,
	RegistryBindings
} from "../types";
