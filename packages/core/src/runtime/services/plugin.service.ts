import { Effect, Exit, Layer, Scope } from "effect";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginRegistry,
	SecretsConfig
} from "../../types";
import { ModuleFederationService } from "./module-federation.service";
import { PluginLifecycleService } from "./plugin-lifecycle.service";
import { PluginLoaderService, PluginRegistryTag, RegistryService } from "./plugin-loader.service";
import { SecretsConfigTag, SecretsService } from "./secrets.service";

export class PluginService extends Effect.Service<PluginService>()("PluginService", {
	scoped: Effect.gen(function* () {
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
}) {
	static Live = (registry: PluginRegistry, secrets: SecretsConfig) => {
		const contextLayer = Layer.mergeAll(
			Layer.succeed(PluginRegistryTag, registry),
			Layer.succeed(SecretsConfigTag, secrets),
		);

		const servicesLayer = Layer.mergeAll(
			ModuleFederationService.Default,
			SecretsService.Default,
			RegistryService.Default,
			PluginLifecycleService.Default,
		).pipe(
			Layer.provide(contextLayer)
		);

		return PluginService.Default.pipe(
			Layer.provide(PluginLoaderService.Default),
			Layer.provide(servicesLayer)
		);
	}
}
