export * from "./errors";
export * from "./plugin";
export * from "./runtime";

// Re-export the normalize helper for build configs
export { getNormalizedRemoteName } from "./runtime/services/normalize";

export type {
	AnyPlugin,
	ConfigOf,
	InitializedPlugin,
	EveryPlugin,
	PluginConstructor,
	PluginInstance,
	PluginOf,
	PluginRegistry,
	PluginRegistryFor,
	PluginRuntimeConfig,
	RegistryBindings,
	RouterOf,
	SecretsConfig
} from "./types";
