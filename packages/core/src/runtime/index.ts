import { createRouterClient } from "@orpc/server";
import { Cause, Effect, Exit, Hash, ManagedRuntime, Option } from "effect";
import type {
	AnyPlugin,
	InitializedPlugin,
	LoadedPlugin,
	PluginClientType,
	PluginConfigInput,
	PluginInstance,
	PluginRegistry,
	PluginRouterType,
	PluginRuntimeConfig,
	RegisteredPlugin,
	RegisteredPlugins,
	UsePluginResult
} from "../types";
import { PluginRuntimeError } from "./errors";
import { PluginService } from "./services/plugin.service";

export class PluginRuntime<R extends RegisteredPlugins = RegisteredPlugins> {
	private pluginCache = new Map<string, Promise<InitializedPlugin<AnyPlugin>>>();

	constructor(
		private runtime: ManagedRuntime.ManagedRuntime<PluginService, never>,
		private registry: PluginRegistry
	) { }

	private generateCacheKey(pluginId: string, config: unknown): string {
		const configHash = Hash.structure(config as object).toString();
		return `${pluginId}:${configHash}`;
	}

	private validatePluginId(
		pluginId: string
	): Effect.Effect<string, PluginRuntimeError> {
		if (!(pluginId in this.registry)) {
			return Effect.fail(new PluginRuntimeError({
				pluginId: String(pluginId),
				operation: "validate-plugin-id",
				cause: new Error(`Plugin ID '${String(pluginId)}' not found in registry.`),
				retryable: false,
			}));
		}
		return Effect.succeed(String(pluginId));
	}

	private async runPromise<A, E>(
		effect: Effect.Effect<A, E, PluginService>
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

	async usePlugin<K extends keyof RegisteredPlugins & string>(
		pluginId: K,
		config: PluginConfigInput<R[K]>
	): Promise<UsePluginResult<K>> {
		const cacheKey = this.generateCacheKey(pluginId, config);

		let cachedPromise = this.pluginCache.get(cacheKey);
		if (!cachedPromise) {
			const operation = Effect.gen(this, function* () {
				const pluginService = yield* PluginService;
				const validatedId = yield* this.validatePluginId(pluginId);

				// Load → Instantiate → Initialize
				const ctor = yield* pluginService.loadPlugin(validatedId);
				const instance = yield* pluginService.instantiatePlugin(pluginId, ctor);
				const initialized = yield* pluginService.initializePlugin(instance, config);

				return initialized;
			}).pipe(Effect.provide(this.runtime));

			cachedPromise = this.runPromise(operation);
			this.pluginCache.set(cacheKey, cachedPromise);
		}

		const initialized = await cachedPromise;
		const router = initialized.plugin.createRouter(initialized.context);
		const client = createRouterClient(router);

		return {
			router: router as PluginRouterType<R[K]>,
			client: client as PluginClientType<R[K]>,
			metadata: initialized.metadata,
			initialized: initialized as unknown as InitializedPlugin<RegisteredPlugin<K>>
		} as UsePluginResult<K>;
	}

	async loadPlugin<K extends keyof RegisteredPlugins & string>(
		pluginId: K
	): Promise<LoadedPlugin<RegisteredPlugin<K>>> {
		const effect = Effect.gen(function* () {
			const pluginService = yield* PluginService;
			return yield* pluginService.loadPlugin(pluginId);
		});
		return this.runPromise(effect) as Promise<LoadedPlugin<RegisteredPlugin<K>>>;
	}

	async instantiatePlugin<K extends keyof RegisteredPlugins & string>(
		pluginId: K,
		loadedPlugin: LoadedPlugin<RegisteredPlugin<K>>
	): Promise<PluginInstance<RegisteredPlugin<K>>> {
		const effect = Effect.gen(function* () {
			const pluginService = yield* PluginService;
			return yield* pluginService.instantiatePlugin(pluginId, loadedPlugin);
		});
		return this.runPromise(effect) as Promise<PluginInstance<RegisteredPlugin<K>>>;
	}

	async initializePlugin<T extends AnyPlugin>(
		instance: PluginInstance<T>,
		config: any
	): Promise<InitializedPlugin<T>> {
		const effect = Effect.gen(function* () {
			const pluginService = yield* PluginService;
			return yield* pluginService.initializePlugin(instance, config);
		});
		return this.runPromise(effect);
	}

	async shutdown(): Promise<void> {
		const effect = Effect.gen(function* () {
			const pluginService = yield* PluginService;
			yield* pluginService.cleanup();
		});
		return this.runPromise(effect);
	}

	async evictPlugin<K extends keyof RegisteredPlugins & string>(
		pluginId: K,
		config: PluginConfigInput<RegisteredPlugins[K]>
	): Promise<void> {
		const cacheKey = this.generateCacheKey(pluginId, config);
		const cachedPromise = this.pluginCache.get(cacheKey);

		if (cachedPromise) {
			this.pluginCache.delete(cacheKey);

			try {
				const pluginResult = await cachedPromise;
				const effect = Effect.gen(function* () {
					const pluginService = yield* PluginService;
					return yield* pluginService.shutdownPlugin(pluginResult);
				});
				await this.runPromise(effect);
			} catch {
				// Ignore errors during shutdown
			}
		}
	}
}

export function createPluginRuntime(
	config: PluginRuntimeConfig
): PluginRuntime {
	const secrets = config.secrets || {};

	const layer = PluginService.Live(config.registry, secrets);
	const runtime = ManagedRuntime.make(layer);

	return new PluginRuntime(runtime, config.registry);
}
