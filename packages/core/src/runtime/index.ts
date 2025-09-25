import { Context, Effect, Layer, ManagedRuntime } from "effect";
import type { z } from "zod";
import { PluginRuntimeError } from "./errors";
import { ModuleFederationService } from "./services/module-federation.service";
import { type IPluginService, PluginService } from "./services/plugin.service";
import { SecretsService } from "./services/secrets.service";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginBindingsFor,
	PluginConstructor,
	PluginInstance,
	PluginOf,
	PluginRegistry,
	PluginRuntimeConfig,
	RegistryBindings
} from "./types";

// Unified runtime interface that works with or without bindings
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
	) => Effect.Effect<InitializedPlugin<PluginOf<R[K]>>, PluginRuntimeError>;

	readonly shutdown: () => Effect.Effect<void, never, never>;
}
export class PluginRuntime<R extends RegistryBindings = RegistryBindings> implements IPluginRuntime<R> {
	constructor(
		private pluginService: IPluginService,
		private registry: PluginRegistry,
		private bindings?: PluginBindingsFor<R>
	) { }

	private validatePluginId<K extends keyof R>(pluginId: K): Effect.Effect<string, PluginRuntimeError> {
		const pluginIdStr = pluginId as string;

		// Runtime validation
		if (!(pluginIdStr in this.registry)) {
			return Effect.fail(new PluginRuntimeError({
				pluginId: pluginIdStr,
				operation: "validate-plugin-id",
				cause: new Error(`Plugin ID '${pluginIdStr}' not found in registry`),
				retryable: false,
			}));
		}

		// If bindings are provided, also validate against bindings
		if (this.bindings && !(pluginIdStr in this.bindings)) {
			return Effect.fail(new PluginRuntimeError({
				pluginId: pluginIdStr,
				operation: "validate-plugin-id",
				cause: new Error(`Plugin ID '${pluginIdStr}' not found in bindings`),
				retryable: false,
			}));
		}

		return Effect.succeed(pluginIdStr);
	}

	loadPlugin<K extends keyof R>(pluginId: K): Effect.Effect<PluginConstructor<PluginOf<R[K]>>, PluginRuntimeError> {
		const self = this;
		return Effect.gen(function* () {
			const validatedId = yield* self.validatePluginId(pluginId);
			const result = yield* self.pluginService.loadPlugin<PluginOf<R[K]>>(validatedId);
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
	): Effect.Effect<InitializedPlugin<PluginOf<R[K]>>, PluginRuntimeError> {
		const self = this;
		return Effect.gen(function* () {
			const validatedId = yield* self.validatePluginId(pluginId);
			const result = yield* self.pluginService.usePlugin<PluginOf<R[K]>>(validatedId, config);
			return result as InitializedPlugin<PluginOf<R[K]>>;
		});
	}

	shutdown(): Effect.Effect<void, never, never> {
		return this.pluginService.cleanup();
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

export function createPluginRuntime<R extends RegistryBindings = RegistryBindings>(
	config: PluginRuntimeConfig<R>
) {
	const layer = PluginRuntimeService.Live(config);
	const runtime = ManagedRuntime.make(layer);

	const createTypedRuntime = Effect.gen(function* () {
		const pluginService = yield* PluginRuntimeService;
		return new PluginRuntime<R>(pluginService, config.registry, config.bindings);
	});

	return {
		runtime,
		PluginRuntime: createTypedRuntime.pipe(Effect.provide(runtime))
	};
}

export type {
	ConfigOf,
	InitializedPlugin,
	PluginOf,
	RegistryBindings
} from "./types";
