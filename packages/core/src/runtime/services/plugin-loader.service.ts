import { Context, Effect, Layer } from "effect";
import type { z } from "zod";
import { PluginRuntimeError, toPluginRuntimeError } from "../errors";
import type {
	AnyPlugin,
	InitializedPlugin,
	PluginConstructor,
	PluginInstance,
	PluginRegistry,
	SecretsConfig
} from "../types";
import { validate } from "../validation";
import { ModuleFederationService } from "./module-federation.service";
import { SecretsService } from "./secrets.service";

export interface IPluginLoaderService {
	readonly loadPlugin: <T extends AnyPlugin = AnyPlugin>(
		pluginId: string,
	) => Effect.Effect<PluginConstructor<T>, PluginRuntimeError>;
	readonly instantiatePlugin: <T extends AnyPlugin>(
		pluginConstructor: PluginConstructor<T>,
	) => Effect.Effect<PluginInstance<T>, PluginRuntimeError>;
	readonly initializePlugin: <T extends AnyPlugin>(
		pluginInstance: PluginInstance<T>,
		config: z.infer<T["configSchema"]>,
	) => Effect.Effect<InitializedPlugin<T>, PluginRuntimeError>;
}

export class PluginLoaderService extends Context.Tag("PluginLoaderService")<
	PluginLoaderService,
	IPluginLoaderService
>() {
	static Live = (registry: PluginRegistry, secrets: SecretsConfig) =>
		Layer.effect(
			PluginLoaderService,
			Effect.gen(function* () {
				const moduleFederationService = yield* ModuleFederationService;
				const secretsService = yield* SecretsService;

				const resolveUrl = (baseUrl: string, version?: string): string =>
					version && version !== "latest"
						? baseUrl.replace("@latest", `@${version}`)
						: baseUrl;

				const getMetadata = (pluginId: string) =>
					Effect.fromNullable(registry[pluginId]).pipe(
						Effect.mapError(() =>
							new PluginRuntimeError({
								pluginId,
								operation: "load-plugin",
								cause: new Error(`Plugin ${pluginId} not found in registry`),
								retryable: false,
							}),
						),
					);

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
						config: z.infer<T["configSchema"]>,
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
								validatedConfig,
								secrets,
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

							// Initialize plugin and capture the returned context
							const context = yield* plugin.initialize(finalConfig).pipe(
								Effect.mapError((error) =>
									toPluginRuntimeError(error, plugin.id, undefined, "initialize-plugin", false),
								)
							);

							return {
								plugin,
								metadata: pluginInstance.metadata,
								config: finalConfig as z.infer<T["configSchema"]>,
								context,
							} satisfies InitializedPlugin<T>;
						}),
				};
			}),
		);
}

export const PluginLoaderServiceTag = PluginLoaderService;
export const PluginLoaderServiceLive = PluginLoaderService.Live;
