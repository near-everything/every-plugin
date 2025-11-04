import { Layer, ManagedRuntime } from "effect";
import { PluginRuntime } from "../runtime";
import {
	PluginLifecycleService,
	PluginLoaderService,
	PluginRegistryTag,
	PluginService,
	RegistryService,
	SecretsConfigTag,
	SecretsService
} from "../runtime/services";
import type { PluginRuntimeConfig, RegisteredPlugins } from "../types";
import { createMockModuleFederationServiceLayer, type PluginMap } from "./mocks/module-federation.service";

/**
 * Validates that all plugin map keys exist in RegisteredPlugins.
 * This ensures proper type inference for client methods.
 */
type ValidatePluginMap<T extends PluginMap> = {
	[K in keyof T]: K extends keyof RegisteredPlugins
		? T[K]
		: `❌ Plugin key "${K & string}" not registered in RegisteredPlugins. Add it to your types.d.ts file.`;
};

/**
 * Simplified type inference for local plugin maps.
 * Just use the constructor types directly.
 *
 * @example
 * ```ts
 * const pluginMap = { "my-plugin": MyPlugin } as const;
 * type MyBindings = InferBindingsFromMap<typeof pluginMap>;
 * ```
 */
export type InferBindingsFromMap<T extends PluginMap> = {
	[K in keyof T]: T[K]
} & RegisteredPlugins;

/**
 * Creates a test layer with mock ModuleFederationService for unit testing.
 * This mirrors PluginService.Live() but uses mock ModuleFederationService.
 */
export const createTestLayer = <R extends RegisteredPlugins = RegisteredPlugins>(
	config: PluginRuntimeConfig<R>,
	pluginMap: PluginMap
) => {
	const secrets = config.secrets || {};

	const contextLayer = Layer.mergeAll(
		Layer.succeed(PluginRegistryTag, config.registry),
		Layer.succeed(SecretsConfigTag, secrets),
	);

	const mockModuleFederationLayer = createMockModuleFederationServiceLayer(pluginMap);

	const servicesLayer = Layer.mergeAll(
		mockModuleFederationLayer,
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
};

/**
 * Creates a plugin runtime for locally available plugins (non-remote).
 * Automatically infers type bindings from the plugin map, eliminating
 * the need for manual RegistryBindings definitions.
 *
 * Ideal for:
 * - Unit and integration tests
 * - Local development and debugging
 * - Monorepo setups where all plugins are in the same workspace
 *
 * For production with remote Module Federation plugins, use createPluginRuntime().
 *
 * @example
 * ```ts
 * const pluginMap = { "my-plugin": MyPlugin } as const;
 * const runtime = createLocalPluginRuntime({ registry, secrets }, pluginMap);
 *
 * // Types are automatically inferred - no manual bindings needed!
 * const plugin = await runtime.usePlugin("my-plugin", config);
 * ```
 */
export function createLocalPluginRuntime<TMap extends PluginMap & ValidatePluginMap<TMap>>(
	config: PluginRuntimeConfig,
	pluginMap: TMap
): PluginRuntime<InferBindingsFromMap<TMap>> {
	const layer = createTestLayer(config, pluginMap);
	const runtime = ManagedRuntime.make(layer);

	return new PluginRuntime<InferBindingsFromMap<TMap>>(runtime, config.registry);
}

/**
 * @deprecated Use `createLocalPluginRuntime` instead. This alias is kept for backward compatibility.
 */
export const createTestPluginRuntime = createLocalPluginRuntime;

// Re-export useful types for tests
export type { EveryPlugin, PluginRegistry, RegisteredPlugins } from "../types";
export type { PluginMap, PluginRuntimeConfig };
