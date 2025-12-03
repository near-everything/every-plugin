import type { AnyPluginConstructor, InferRegistryFromEntries, PluginRegistryEntry, PluginRuntimeConfig } from "../types";
import { createPluginRuntime } from "../runtime";
import type { LoadedPluginWithBinding } from "../plugin";

export type PluginMap = Record<string, LoadedPluginWithBinding<any, any, any, any>>;

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
};

/**
 * Converts old pluginMap format to new registry format
 */
function convertPluginMapToRegistry<T extends PluginMap>(
	oldRegistry: Record<string, { remoteUrl: string; version?: string; description?: string }>,
	pluginMap: T
): Record<keyof T, PluginRegistryEntry> {
	const registry: Record<string, PluginRegistryEntry> = {};
	
	for (const [pluginId, ctor] of Object.entries(pluginMap)) {
		const oldEntry = oldRegistry[pluginId];
		registry[pluginId] = {
			module: ctor as AnyPluginConstructor,
			remote: oldEntry?.remoteUrl,
			version: oldEntry?.version,
			description: oldEntry?.description,
		};
	}
	
	return registry as Record<keyof T, PluginRegistryEntry>;
}

/**
 * Creates a plugin runtime for locally available plugins (non-remote).
 * Automatically infers type bindings from the plugin map, eliminating
 * the need for manual RegistryBindings definitions.
 *
 * @deprecated Use `createPluginRuntime` with module entries directly instead.
 * @example
 * ```ts
 * // Old API (deprecated)
 * const runtime = createLocalPluginRuntime(
 *   { registry: { "my-plugin": { remoteUrl: "..." } }, secrets },
 *   { "my-plugin": MyPlugin }
 * );
 * 
 * // New API (recommended)
 * const runtime = createPluginRuntime({
 *   registry: { "my-plugin": { module: MyPlugin } },
 *   secrets
 * });
 * ```
 */
export function createLocalPluginRuntime<TMap extends PluginMap>(
	config: {
		registry: Record<string, { remoteUrl: string; version?: string; description?: string }>;
		secrets?: Record<string, string>;
		options?: any;
	},
	pluginMap: TMap
) {
	const newRegistry = convertPluginMapToRegistry(config.registry, pluginMap);
	
	return createPluginRuntime({
		registry: newRegistry,
		secrets: config.secrets,
		options: config.options,
	});
}

/**
 * @deprecated Use `createLocalPluginRuntime` or `createPluginRuntime` instead.
 */
export const createTestPluginRuntime = createLocalPluginRuntime;

export type { EveryPlugin, PluginRegistry, RegisteredPlugins } from "../types";
export type { PluginRuntimeConfig };
