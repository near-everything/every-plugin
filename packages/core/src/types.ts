import type { AnyContractRouter } from "@orpc/contract";
import type { Context, Router } from "@orpc/server";
import type { Scope } from "effect";
import type { z } from "zod";
import type { Plugin, PluginConfigFor, PluginConstructorWithBinding } from "./plugin";

export type AnyContract = Router<AnyContractRouter, any>

/**
 * Base type for any plugin instance.
 * This is the foundation that enables type inference across the entire plugin system.
 * Uses 'any' for context to allow plugins with custom context types.
 */
export type AnyPlugin = Plugin<AnyContractRouter, z.ZodTypeAny, z.ZodTypeAny, any>;

/**
 * Registry bindings define the compile-time shape of available plugins.
 * This is a type-only construct that enables full IDE autocomplete and type safety
 * without requiring runtime plugin imports.
 */
export type RegistryBindings = Record<string, {
  contract: AnyContractRouter;
  config: PluginConfigFor<z.ZodTypeAny, z.ZodTypeAny>;
}>;

/**
 * Extracts the Plugin type from a binding definition.
 * This enables type inference: Binding → Plugin → Router → Client
 */
export type PluginOf<B> =
  B extends { contract: infer C; config: infer Conf }
  ? Conf extends PluginConfigFor<infer V, infer S>
  ? C extends AnyContractRouter
  ? Plugin<C, V, S>
  : never
  : never
  : never;

/**
 * Extracts the config type from a binding definition.
 * This provides strongly-typed configuration based on the plugin's zod schema.
 */
export type ConfigOf<B> = z.infer<PluginOf<B>["configSchema"]>;

/**
 * Extracts the router type from a plugin.
 * This enables type inference from Plugin → Router → RouterClient with full procedure autocomplete.
 */
export type RouterOf<T extends AnyPlugin> = ReturnType<T["createRouter"]>;

/**
 * Extracts the context type from a plugin.
 * This is used for typing the router client context parameter.
 */
export type ContextOf<T extends AnyPlugin> = T extends Plugin<AnyContractRouter, z.ZodTypeAny, z.ZodTypeAny, infer TContext> ? TContext : never;

/**
 * Infers binding definitions from plugin constructor objects.
 * Used to derive RegistryBindings from a collection of plugin constructors.
 */
export type InferBindingsFromPlugins<T> = {
  [K in keyof T]:
  T[K] extends PluginConstructorWithBinding<infer C, infer V, infer S, infer Ctx>
  ? { contract: C; config: PluginConfigFor<V, S> }
  : never;
};

/**
 * Converts registry bindings to plugin constructor types.
 * This is used internally by the runtime to maintain type safety.
 */
export type PluginBindingsFor<R extends RegistryBindings> = {
  [K in keyof R]:
  R[K] extends { contract: infer C; config: infer Conf }
  ? Conf extends PluginConfigFor<infer V, infer S>
  ? C extends AnyContractRouter
  ? PluginConstructorWithBinding<C, V, S, Context>
  : never
  : never
  : never;
};

/**
 * Runtime registry configuration.
 * Maps plugin IDs to their remote URLs and metadata.
 */
export type PluginRegistry = Record<string, {
  remoteUrl: string;
  type: string;
  version?: string;
  description?: string;
}>;

/**
 * Type-safe registry that enforces key alignment with bindings.
 * When used with RegistryBindings, ensures plugin IDs match between registry and type definitions.
 */
export type PluginRegistryFor<R extends RegistryBindings> = {
  [K in keyof R]: {
    remoteUrl: string;
    type: string;
    version?: string;
    description?: string;
  };
};

/**
 * Configuration for secrets injection.
 * Secrets are hydrated into plugin configs using template replacement.
 */
export interface SecretsConfig {
  [key: string]: string;
}

/**
 * Plugin constructor with metadata.
 * Represents a loaded plugin class ready for instantiation.
 */
export interface PluginConstructor<T extends AnyPlugin = AnyPlugin> {
  readonly ctor: new () => T;
  readonly metadata: {
    readonly pluginId: string;
    readonly version?: string;
    readonly description?: string;
    readonly type?: string;
  };
}

/**
 * Instantiated plugin with metadata.
 * Represents a plugin instance ready for initialization.
 */
export interface PluginInstance<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: {
    readonly pluginId: string;
    readonly version?: string;
    readonly description?: string;
    readonly type?: string;
  };
}

/**
 * Fully initialized plugin ready for use.
 * Contains the plugin instance, validated config, execution context, and scope.
 * This is what gets passed to createPluginClient for type-safe procedure calls.
 */
export interface InitializedPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: {
    readonly pluginId: string;
    readonly version?: string;
    readonly description?: string;
    readonly type?: string;
  };
  readonly config: z.infer<T["configSchema"]>;
  readonly context: ContextOf<T>;
  readonly scope: Scope.CloseableScope;
}

/**
 * Runtime options for plugin execution and resource management.
 */
export interface RuntimeOptions {
  /** Resource isolation level for plugins */
  isolation?: "strict" | "shared" | "none";
  /** Memory limit per plugin instance */
  memoryLimit?: string;
  /** Maximum concurrent plugin operations */
  concurrency?: number;
  /** Resource timeout for plugin operations */
  resourceTimeout?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Enable metrics collection */
  metrics?: boolean;
}

/**
 * Enhanced plugin result containing client, router, and metadata.
 */
export interface EveryPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly client: import("@orpc/server").RouterClient<RouterOf<T>, Record<never, never>>;
  readonly router: RouterOf<T>;
  readonly metadata: {
    readonly pluginId: string;
    readonly version?: string;
    readonly description?: string;
    readonly type?: string;
  };
  readonly initialized: InitializedPlugin<T>;
}

/**
 * Runtime configuration for the plugin system.
 * The generic R parameter enables compile-time type safety when provided.
 */
export interface PluginRuntimeConfig<R extends RegistryBindings = RegistryBindings> {
  registry: PluginRegistry;
  secrets?: SecretsConfig;
  options?: RuntimeOptions;
}
