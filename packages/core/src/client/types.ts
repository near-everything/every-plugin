import type { AnyContractRouter } from "@orpc/contract";
import type { AnyRouter, Context } from "@orpc/server";
import type { z } from "zod";
import type { Plugin, PluginConfigFor, PluginConstructorWithBinding } from "../plugin";

// Automatic type inference from plugin constructors
export type InferBindingsFromPlugins<T> = {
	[K in keyof T]: T[K] extends PluginConstructorWithBinding<infer C, infer V, infer S, infer Ctx>
		? { contract: C; config: PluginConfigFor<V, S> }
		: never;
};

// Runtime configuration
export interface PluginRuntimeConfig<R extends RegistryBindings = RegistryBindings> {
	registry: PluginRegistry;
	secrets?: SecretsConfig;
	bindings?: R extends RegistryBindings ? PluginBindingsFor<R> : never;
}

// Helper type to extract plugin constructors from bindings
export type PluginBindingsFor<R extends RegistryBindings> = {
	[K in keyof R]: R[K] extends { contract: infer C; config: infer Conf }
		? Conf extends PluginConfigFor<infer V, infer S>
			? C extends AnyContractRouter
				? PluginConstructorWithBinding<C, V, S, Context>
				: never
			: never
		: never;
};

export interface SecretsConfig {
	[key: string]: string;
}

// Static registry type
export type PluginRegistry = Record<string, {
	remoteUrl: string;
	type: string;
	version?: string;
	description?: string;
}>;

// Registry that matches the binding keys exactly
export type PluginRegistryFor<R extends RegistryBindings> = {
	[K in keyof R]: {
		remoteUrl: string;
		type: string;
		version?: string;
		description?: string;
	};
};

/**
 * Plugin lifecycle types
 */
export type AnyPlugin = Plugin<AnyContractRouter, z.ZodTypeAny, z.ZodTypeAny, Context>;

// Type-safe registry bindings - use the utility type from plugin.ts
export type RegistryBindings = Record<string, { contract: AnyContractRouter; config: PluginConfigFor<z.ZodTypeAny, z.ZodTypeAny> }>;

// Utility types for extracting plugin information from bindings
export type PluginOf<B> = B extends { contract: infer C; config: infer Conf }
	? Conf extends PluginConfigFor<infer V, infer S>
		? C extends AnyContractRouter
			? Plugin<C, V, S>
			: never
		: never
	: never;

export type ConfigOf<B> = z.infer<PluginOf<B>["configSchema"]>;

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
	readonly context: Context;
}

/**
 * Helper type to extract the router type from a plugin
 */
export type RouterOf<T extends AnyPlugin> = ReturnType<T["createRouter"]>;
