import { Cause, Effect, Exit, Hash, ManagedRuntime, Option } from "effect";
import type { z } from "zod";
import { createPluginClient, getPluginRouter } from "../client/index";
import type {
	AnyPlugin,
	ConfigOf,
	EveryPlugin,
	InitializedPlugin,
	LoadedPlugin,
	PluginInstance,
	PluginOf,
	PluginRegistry,
	RegistryBindings,
	RuntimeOptions,
	SecretsConfig
} from "../types";
import { PluginRuntimeError } from "./errors";
import { PluginService } from "./services/plugin.service";

export class PluginRuntime<R extends RegistryBindings = RegistryBindings> {
	private pluginCache = new Map<string, Effect.Effect<EveryPlugin<AnyPlugin>, PluginRuntimeError>>();

	constructor(
		private runtime: ManagedRuntime.ManagedRuntime<PluginService, never>,
		private registry: PluginRegistry
	) { }

	private generateCacheKey(pluginId: string, config: unknown): string {
		const configHash = Hash.structure(config as object).toString();
		return `${pluginId}:${configHash}`;
	}

	private validatePluginId<K extends keyof R>(pluginId: K): Effect.Effect<string, PluginRuntimeError> {
		const pluginIdStr = pluginId as string;

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

	private async runPromise<A, E, Req extends PluginService | never = PluginService>(
		effect: Effect.Effect<A, E, Req>
	): Promise<A> {
		const exit = await this.runtime.runPromiseExit(effect);

		if (Exit.isFailure(exit)) {
			const error = Cause.failureOption(exit.cause);
			if (Option.isSome(error)) {
				throw error.value;
			}
			throw Cause.squash(exit.cause);
		}

		return exit.value;
	}

	loadPlugin<K extends keyof R>(pluginId: K): Promise<LoadedPlugin<PluginOf<R[K]>>> {
		const effect = Effect.gen(this, function* () {
			const pluginService = yield* PluginService;
			const validatedId = yield* this.validatePluginId(pluginId);
			const result = yield* pluginService.loadPlugin(validatedId);
			return result as LoadedPlugin<PluginOf<R[K]>>;
		});
		return this.runPromise(effect);
	}

	instantiatePlugin<K extends keyof R>(pluginId: K, loadedPlugin: LoadedPlugin<PluginOf<R[K]>>): Promise<PluginInstance<PluginOf<R[K]>>> {
		const effect = Effect.gen(this, function* () {
			const pluginService = yield* PluginService;
			const pluginIdStr = pluginId as string;
			const result = yield* pluginService.instantiatePlugin(pluginIdStr, loadedPlugin);
			return result as PluginInstance<PluginOf<R[K]>>;
		});
		return this.runPromise(effect);
	}

	initializePlugin<K extends keyof R>(
		instance: PluginInstance<PluginOf<R[K]>>,
		config: z.input<PluginOf<R[K]>["configSchema"]>
	): Promise<InitializedPlugin<PluginOf<R[K]>> & {
		config: ConfigOf<R[K]>;
	}> {
		const effect = Effect.gen(this, function* () {
			const pluginService = yield* PluginService;
			const result = yield* pluginService.initializePlugin(
				instance as PluginInstance<AnyPlugin>,
				config
			);
			return result as InitializedPlugin<PluginOf<R[K]>>;
		});
		return this.runPromise(effect);
	}

	async usePlugin<K extends keyof R>(
		pluginId: K,
		config: z.input<PluginOf<R[K]>["configSchema"]>
	): Promise<EveryPlugin<PluginOf<R[K]>> & {
		initialized: InitializedPlugin<PluginOf<R[K]>> & {
			config: ConfigOf<R[K]>;
		};
	}> {
		const cacheKey = this.generateCacheKey(String(pluginId), config);

		let cachedPlugin = this.pluginCache.get(cacheKey);
		if (!cachedPlugin) {
			const operation = Effect.gen(this, function* () {
				const pluginService = yield* PluginService;
				const validatedId = yield* this.validatePluginId(pluginId);

				// Load → Instantiate → Initialize
				const ctor = yield* pluginService.loadPlugin(validatedId);
				const instance = yield* pluginService.instantiatePlugin(String(pluginId), ctor);
				const _initialized = yield* pluginService.initializePlugin(instance, config);

				type PluginType = PluginOf<R[K]>;
				const initialized = _initialized as InitializedPlugin<PluginType>;
				const client = createPluginClient(initialized);
				const router = getPluginRouter(initialized);

				return {
					client,
					router,
					metadata: initialized.metadata,
					initialized
				} as EveryPlugin<PluginType>;
			}).pipe(
				Effect.provide(this.runtime)
			);

			cachedPlugin = Effect.cached(operation).pipe(Effect.flatten);
			this.pluginCache.set(cacheKey, cachedPlugin);
		}

		return this.runPromise(cachedPlugin as Effect.Effect<EveryPlugin<PluginOf<R[K]>>, PluginRuntimeError, never>);
	}

	shutdown(): Promise<void> {
		const effect = Effect.gen(function* () {
			const pluginService = yield* PluginService;
			yield* pluginService.cleanup();
		});
		return this.runPromise(effect);
	}

	evictPlugin<K extends keyof R>(
		pluginId: K,
		config: z.input<PluginOf<R[K]>["configSchema"]>
	): Promise<void> {
		const cacheKey = this.generateCacheKey(String(pluginId), config);

		const effect = Effect.gen(this, function* () {
			const pluginService = yield* PluginService;
			const cachedPlugin = this.pluginCache.get(cacheKey);

			if (cachedPlugin) {
				this.pluginCache.delete(cacheKey);

				const pluginResult = yield* cachedPlugin.pipe(Effect.catchAll(() => Effect.succeed(null)));

				if (pluginResult?.initialized) {
					yield* pluginService.shutdownPlugin(pluginResult.initialized).pipe(
						Effect.catchAll(() => Effect.void)
					);
				}
			}
		}).pipe(
			Effect.catchAll(() => Effect.void)
		);

		return this.runPromise(effect);
	}
}

export function createPluginRuntime<R extends RegistryBindings = RegistryBindings>(
	config: { registry: PluginRegistry; secrets?: SecretsConfig; options?: RuntimeOptions }
): PluginRuntime<R> {
	const secrets = config.secrets || {};

	const layer = PluginService.Live(config.registry, secrets);

	const runtime = ManagedRuntime.make(layer);

	return new PluginRuntime<R>(runtime, config.registry);
}

export type {
	ConfigOf,
	EveryPlugin,
	InitializedPlugin,
	PluginOf,
	RegistryBindings
} from "../types";
