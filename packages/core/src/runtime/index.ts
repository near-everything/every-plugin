import { Context, Effect, Layer, ManagedRuntime } from "effect";
import type { z } from "zod";
import type { PluginRuntimeError } from "./errors";
import { ModuleFederationService } from "./services/module-federation.service";
import { PluginService } from "./services/plugin.service";
import { SecretsService } from "./services/secrets.service";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginOf,
	PluginRuntimeConfig,
	RegistryBindings,
} from "./types";

// Main PluginRuntime service interface
export interface IPluginRuntime<R extends RegistryBindings = RegistryBindings> {
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

	// usePlugin: keyed overload + generic fallback
	readonly usePlugin:
	& (<K extends keyof R>(
		pluginId: K,
		config: z.infer<PluginOf<R[K]>["configSchema"]>,) => Effect.Effect<InitializedPlugin<PluginOf<R[K]>>, PluginRuntimeError>)
	& (<T extends AnyPlugin>(
		pluginId: string,
		config: z.infer<T["configSchema"]>,) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>);

	readonly shutdown: () => Effect.Effect<void, never, never>;
}

export class PluginRuntime extends Context.Tag("PluginRuntime")<
	PluginRuntime,
	IPluginRuntime
>() {
	static Live = <R extends RegistryBindings = RegistryBindings>(config: PluginRuntimeConfig<R>) => {
		const secrets = config.secrets || {};

		return Layer.scoped(
			PluginRuntime,
			Effect.gen(function* () {
				const pluginService = yield* PluginService;

				// Register cleanup finalizer for automatic resource management
				yield* Effect.addFinalizer(() =>
					pluginService.cleanup().pipe(
						Effect.catchAll(() => Effect.void) // Ensure cleanup never fails
					)
				);

				return {
					loadPlugin: pluginService.loadPlugin,
					instantiatePlugin: pluginService.instantiatePlugin,
					initializePlugin: pluginService.initializePlugin,
					usePlugin: pluginService.usePlugin as IPluginRuntime["usePlugin"],
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
						),
					),
				),
			),
		);
	}
}

export function createPluginRuntime<R extends RegistryBindings = RegistryBindings>(config: PluginRuntimeConfig<R>) {
	const layer = PluginRuntime.Live<R>(config);
	const runtime = ManagedRuntime.make(layer);
	const TypedPluginRuntime = PluginRuntime as unknown as Context.Tag<PluginRuntime, IPluginRuntime<R>>;
	return { runtime, PluginRuntime: TypedPluginRuntime };
}

export type {
	ConfigOf,
	InitializedPlugin,
	PluginBinding,
	PluginOf,
	RegistryBindings
} from "./types";
