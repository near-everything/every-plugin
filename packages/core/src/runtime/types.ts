import type { z } from "zod";
import type { Plugin, PluginLogger, PluginRegistry } from "../plugin";

// Runtime configuration
export interface PluginRuntimeConfig {
	registry: PluginRegistry;
	secrets?: SecretsConfig;
	logger?: PluginLogger;
}

export interface SecretsConfig {
	[key: string]: string;
}

// Plugin lifecycle types
export type AnyPlugin = Plugin<z.ZodTypeAny, z.ZodTypeAny, z.ZodTypeAny>;

export interface PluginConstructor {
	readonly ctor: new () => AnyPlugin;
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
}

export interface PluginInstance<T extends AnyPlugin = AnyPlugin> {
	readonly plugin: T;
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
}

export interface InitializedPlugin<T extends AnyPlugin = AnyPlugin> {
	readonly plugin: T;
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
	readonly config: z.infer<T["configSchema"]>;
}
