import { Context, Effect, Scope } from "effect";
import type { z } from "zod";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRegistry
} from "../../types";
import { PluginRuntimeError, toPluginRuntimeError } from "../errors";
import { validate } from "../validation";
import { ModuleFederationService } from "./module-federation.service";
import { SecretsService } from "./secrets.service";

export class PluginRegistryTag extends Context.Tag("PluginRegistry")<
	PluginRegistryTag,
	PluginRegistry
>() { }

export class RegistryService extends Effect.Service<RegistryService>()("RegistryService", {
	effect: Effect.gen(function* () {
		const registry = yield* PluginRegistryTag;

		return {
			get: (pluginId: string) =>
				Effect.fromNullable(registry[pluginId]).pipe(
					Effect.mapError(() =>
						new PluginRuntimeError({
							pluginId,
							operation: "load-plugin",
							cause: new Error(`Plugin ${pluginId} not found in registry`),
							retryable: false,
						}),
					),
				),
		};
	}),
}) { }

export class PluginLoaderService extends Effect.Service<PluginLoaderService>()("PluginLoaderService", {
	effect: Effect.gen(function* () {
		const moduleFederationService = yield* ModuleFederationService;
		const secretsService = yield* SecretsService;
		const registryService = yield* RegistryService;

		const resolveUrl = (baseUrl: string, version?: string): string =>
			version && version !== "latest"
				? baseUrl.replace("@latest", `@${version}`)
				: baseUrl;

		const getMetadata = (pluginId: string) => registryService.get(pluginId);

		return {
			loadPlugin: (pluginId: string) =>
				Effect.gen(function* () {
					const metadata = yield* getMetadata(pluginId);
					const url = resolveUrl(metadata.remoteUrl);

					yield* moduleFederationService.registerRemote(pluginId, url).pipe(
						Effect.mapError((error) =>
							toPluginRuntimeError(error.cause, pluginId, undefined, "register-remote", true),
						),
					);

					yield* Effect.logDebug("Loading plugin", { pluginId, url });

					const ctor = yield* moduleFederationService.loadRemoteConstructor(pluginId, url).pipe(
						Effect.mapError((error) =>
							toPluginRuntimeError(error.cause, pluginId, undefined, "load-remote", false),
						),
					);

					return {
						ctor,
						metadata: {
							pluginId,
							version: metadata.version,
							type: metadata.type,
						},
					} satisfies PluginConstructor;
				}),

			instantiatePlugin: <T extends AnyPlugin>(
				pluginConstructor: PluginConstructor<T>,
			) =>
				Effect.gen(function* () {
					const instance = yield* Effect.try(() => new pluginConstructor.ctor()).pipe(
						Effect.mapError((error) =>
							toPluginRuntimeError(
								error,
								pluginConstructor.metadata.pluginId,
								undefined,
								"instantiate-plugin",
								false,
							),
						),
					);

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
				}),

			initializePlugin: <T extends AnyPlugin>(
				pluginInstance: PluginInstance<T>,
				config: { variables: unknown; secrets: unknown },
			) =>
				Effect.gen(function* () {
					const { plugin } = pluginInstance;

					// Validate and hydrate config
					const validatedConfig = yield* validate(
						plugin.configSchema,
						config,
						plugin.id,
						"config",
					).pipe(
						Effect.mapError((validationError) =>
							new PluginRuntimeError({
								pluginId: plugin.id,
								operation: "validate-config",
								cause: validationError.zodError,
								retryable: false,
							}),
						),
					);

					const hydratedConfig = yield* secretsService.hydrateSecrets(
						validatedConfig
					);

					const finalConfig = yield* validate(
						plugin.configSchema,
						hydratedConfig,
						plugin.id,
						"config",
					).pipe(
						Effect.mapError((validationError) =>
							new PluginRuntimeError({
								pluginId: plugin.id,
								operation: "validate-hydrated-config",
								cause: validationError.zodError,
								retryable: false,
							}),
						),
					);

					// Create a long-lived scope for this plugin instance
					const scope = yield* Scope.make();

					// Initialize plugin within the scope
					const context = yield* plugin.initialize(finalConfig).pipe(
						Effect.provideService(Scope.Scope, scope),
						Effect.mapError((error) =>
							toPluginRuntimeError(error, plugin.id, undefined, "initialize-plugin", false),
						)
					);

					return {
						plugin,
						metadata: pluginInstance.metadata,
						config: finalConfig as z.infer<T["configSchema"]>,
						context,
						scope,
					} satisfies InitializedPlugin<T>;
				}),
		};
	}),
}) {
}
