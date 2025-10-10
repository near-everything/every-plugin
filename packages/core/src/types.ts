import type { AnyContractRouter, ContractRouter } from "@orpc/contract";
import type { Context, Router, RouterClient } from "@orpc/server";
import type { Scope } from "effect";
import type { z } from "zod";
import type { Plugin, PluginConfigFor } from "./plugin";
import type { PluginRuntime } from "./runtime";

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
  ? Plugin<C, V, S, Context>
  : never
  : never
  : never;

/**
 * Extracts the config type from a binding definition.
 * This provides strongly-typed configuration based on the plugin's zod schema.
 */
export type ConfigOf<B> = z.infer<PluginOf<B>["configSchema"]>;

/**
 * The actual router type returned by plugins (with procedures implemented)
 * Supports host context composition via THostContext type parameter
 */
export type PluginRouter<
  T extends AnyPlugin,
  THostContext extends Context = Record<never, never>
> = Router<T["contract"], ContextOf<T> & THostContext>;

/**
 * Extracts the context type from a plugin.
 * This is used for typing the router client context parameter.
 */
export type ContextOf<T extends AnyPlugin> = T extends Plugin<AnyContractRouter, z.ZodTypeAny, z.ZodTypeAny, infer TContext> ? TContext : never;

/**
 * Runtime registry configuration.
 * Maps plugin IDs to their remote URLs and metadata.
 */
export type PluginRegistry = Record<string, PluginMetadata>;

/**
 * Configuration for secrets injection.
 * Secrets are hydrated into plugin configs using template replacement.
 */
export interface SecretsConfig {
  [key: string]: string;
}

/**
 * Shared metadata for plugin lifecycle stages.
 * Contains information about the plugin that persists across different stages.
 */
export type PluginMetadata = {
  readonly remoteUrl: string;
  readonly version?: string;
  readonly description?: string;
};

/**
 * Loaded plugin with metadata.
 */
export interface LoadedPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly ctor: new () => T;
  readonly metadata: PluginMetadata;
}

/**
 * Instantiated plugin with metadata.
 */
export interface PluginInstance<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: PluginMetadata;
}

/**
 * Fully initialized plugin ready for use.
 * Contains the plugin instance, validated config, execution context, and scope.
 */
export interface InitializedPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: PluginMetadata;
  readonly config: z.infer<T["configSchema"]>;
  readonly context: ContextOf<T>;
  readonly scope: Scope.CloseableScope;
}

/**
 * Runtime options for plugin execution and resource management.
 */
export interface RuntimeOptions {
  // TODO: BELOW ARE ALL HYPOTHETICAL, HAVE NOT BEEN IMPLEMENTED.


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
 * Router is typed as ContractRouter for encapsulation, but runtime compatible with oRPC routers.
 * Supports host context composition through THostContext type parameter.
 */
export interface EveryPlugin<
  T extends AnyPlugin = AnyPlugin,
  THostContext extends Context = Record<never, never>
> {
  readonly client: RouterClient<PluginRouter<T, THostContext>, THostContext>;
  readonly router: PluginRouter<T, THostContext>;
  readonly metadata: PluginMetadata;
  readonly initialized: InitializedPlugin<T>;
}

/**
 * Namespace containing type utilities for working with plugin results.
 */
export namespace EveryPlugin {
  /**
   * Extract the typed plugin result from a runtime instance.
   * Provides full type safety for plugin clients, routers, and metadata.
   * 
   * @example
   * ```ts
   * const runtime = createPluginRuntime<MyBindings>({...});
   * let plugin: EveryPlugin.Infer<typeof runtime, "my-plugin">;
   * plugin = await runtime.usePlugin("my-plugin", config);
   * ```
   */
  export type Infer<
    T extends PluginRuntime<any>,
    K extends T extends PluginRuntime<infer R> ? keyof R : never
  > = T extends PluginRuntime<infer R>
    ? EveryPlugin<PluginOf<R[K]>>
    : never;
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
