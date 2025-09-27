import { Context, Effect, Exit, Layer, Scope } from "effect";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRegistry,
	SecretsConfig
} from "../../types";
import type { PluginRuntimeError } from "../errors";
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
		config: { variables: unknown; secrets: unknown },
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
				const loader = yield* PluginLoaderService;
				const lifecycle = yield* PluginLifecycleService;

				return {
					loadPlugin: loader.loadPlugin,
					instantiatePlugin: loader.instantiatePlugin,
					initializePlugin: loader.initializePlugin,
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
