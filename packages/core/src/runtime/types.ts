import type { z } from "zod";
import type { AnyContractRouter } from "@orpc/contract";
import type { AnyRouter, Router } from "@orpc/server";
import type { Plugin } from "../plugin";

export type PluginConfigSchema = z.ZodObject<{ 
	variables: z.ZodTypeAny; 
	secrets: z.ZodTypeAny; 
}>;

// Runtime configuration
export interface PluginRuntimeConfig<R extends RegistryBindings = RegistryBindings> {
	registry: PluginRegistry;
	secrets?: SecretsConfig;
}

export interface SecretsConfig {
	[key: string]: string;
}

export interface PluginRegistry {
	[pluginId: string]: {
		remoteUrl: string;
		type: string;
		version?: string;
		description?: string;
	};
}

/**
 * Plugin lifecycle types
 * Uses Plugin's default TRouter (RouterFromContract) to preserve concrete router types.
 */
export type AnyPlugin = Plugin<AnyContractRouter, PluginConfigSchema, AnyRouter>;

// Type-safe registry bindings
export type RegistryBindings = Record<string, PluginBinding<AnyContractRouter, PluginConfigSchema, z.ZodTypeAny>>;

export interface PluginBinding<
	C extends AnyContractRouter,
	Conf extends PluginConfigSchema,
	S extends z.ZodTypeAny
> {
	contract: C;
	config: Conf;
	state: S;
}

// Utility types for extracting plugin information from bindings
export type PluginOf<B extends PluginBinding<AnyContractRouter, PluginConfigSchema, z.ZodTypeAny>> = Plugin<
	B["contract"],
	B["config"]
>;

export type ConfigOf<B extends PluginBinding<AnyContractRouter, PluginConfigSchema, z.ZodTypeAny>> = z.infer<
	PluginOf<B>["configSchema"]
>;

export interface PluginConstructor<T extends AnyPlugin = AnyPlugin> {
	readonly ctor: new () => T;
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
}

export interface PluginInstance<T extends AnyPlugin = AnyPlugin> {
	readonly plugin: T; // TODO: rename to instance
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
}

export interface InitializedPlugin<T extends AnyPlugin = AnyPlugin> {
	readonly plugin: T; // TODO: rename to instance
	readonly metadata: {
		readonly pluginId: string;
		readonly version?: string;
		readonly description?: string;
		readonly type?: string;
	};
	readonly config: z.infer<T["configSchema"]>;
}

/**
 * Helper type to extract the router type from a plugin
 */
export type RouterOf<T extends AnyPlugin> = ReturnType<T["createRouter"]>;
