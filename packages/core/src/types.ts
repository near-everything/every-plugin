import type { AnyContractRouter, AnySchema, InferSchemaInput, InferSchemaOutput } from "@orpc/contract";
import type { Context, Router, RouterClient } from "@orpc/server";
import type { Scope } from "effect";
import type { Plugin } from "./plugin";

/**
 * Registry bindings interface - populated via module augmentation
 * @example
 * ```typescript
 * declare module "every-plugin" {
 *   interface RegisteredPlugins {
 *     "my-plugin": typeof MyPlugin;
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: required for module augmentation pattern
export interface RegisteredPlugins { }

/**
 * Base type for any plugin instance.
 */
export type AnyPlugin = Plugin<AnyContractRouter, AnySchema, AnySchema, any>;

/**
 * Extract binding from plugin constructor's static property
 */
type ExtractBinding<T> = T extends { binding: infer B }
  ? B
  : never;

/**
 * Extract plugin type from registered plugins by key
 */
export type RegisteredPlugin<K extends keyof RegisteredPlugins> =
  ExtractBinding<RegisteredPlugins[K]> extends {
    contract: infer C extends AnyContractRouter;
    variables: infer V extends AnySchema;
    secrets: infer S extends AnySchema;
    context: infer TContext extends Context;
  }
  ? Plugin<C, V, S, TContext>
  : never;

/**
 * Extract config input type from plugin binding
 */
export type PluginConfigInput<T> = ExtractBinding<T> extends {
  variables: infer V extends AnySchema;
  secrets: infer S extends AnySchema;
}
  ? {
    variables: InferSchemaInput<V>;
    secrets: InferSchemaInput<S>;
  }
  : never;

/**
 * Extract router type from plugin binding
 */
export type PluginRouterType<T> = ExtractBinding<T> extends {
  contract: infer C extends AnyContractRouter;
  context: infer TContext extends Context;
}
  ? Router<C, TContext>
  : never;

/**
 * Extract client type from plugin binding
 */
export type PluginClientType<T> = ExtractBinding<T> extends {
  contract: infer C extends AnyContractRouter;
  context: infer TContext extends Context;
}
  ? RouterClient<Router<C, TContext>>
  : never;

/**
 * Extract context type from plugin binding
 */
export type PluginContextType<T> = ExtractBinding<T> extends {
  context: infer C;
}
  ? C
  : never;

/**
 * Extract context type from plugin instance
 */
export type ContextOf<T extends AnyPlugin> =
  T extends Plugin<AnyContractRouter, AnySchema, AnySchema, infer TContext>
  ? TContext
  : never;

/**
 * Runtime registry configuration.
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
 * Plugin metadata
 */
export type PluginMetadata = {
  readonly remoteUrl: string;
  readonly version?: string;
  readonly description?: string;
};

/**
 * Loaded plugin
 */
export interface LoadedPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly ctor: new () => T;
  readonly metadata: PluginMetadata;
}

/**
 * Instantiated plugin
 */
export interface PluginInstance<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: PluginMetadata;
}

/**
 * Fully initialized plugin ready for use
 */
export interface InitializedPlugin<T extends AnyPlugin = AnyPlugin> {
  readonly plugin: T;
  readonly metadata: PluginMetadata;
  readonly config: {
    variables: InferSchemaOutput<T["configSchema"]["variables"]>;
    secrets: InferSchemaOutput<T["configSchema"]["secrets"]>;
  };
  readonly context: ContextOf<T>;
  readonly scope: Scope.CloseableScope;
}

/**
 * Helper type to detect type errors when looking up RegisteredPlugins
 */
type VerifyPluginBinding<K extends keyof RegisteredPlugins> = ExtractBinding<RegisteredPlugins[K]> extends {
  contract: AnyContractRouter;
  variables: AnySchema;
  secrets: AnySchema;
  context: Context;
}
  ? true
  : `❌ Plugin "${K & string}" is not properly registered. Ensure it extends plugin binding layout { contract, variables, secrets, context }.`;

/**
 * Result of runtime.usePlugin() call
 */
export type UsePluginResult<K extends keyof RegisteredPlugins> = VerifyPluginBinding<K> extends true
  ? {
      readonly client: PluginClientType<RegisteredPlugins[K]>;
      readonly router: PluginRouterType<RegisteredPlugins[K]>;
      readonly metadata: PluginMetadata;
      readonly initialized: InitializedPlugin<RegisteredPlugin<K>>;
    }
  : VerifyPluginBinding<K>;

/**
 * Runtime options
 */
export interface RuntimeOptions {
  isolation?: "strict" | "shared" | "none";
  memoryLimit?: string;
  concurrency?: number;
  resourceTimeout?: string;
  debug?: boolean;
  metrics?: boolean;
}

/**
 * Namespace containing type utilities for working with plugin results.
 */
export namespace EveryPlugin {
  /**
   * Extract plugin runtime instance type from registered plugins.
   * Provides full type safety for plugin clients, routers, and metadata.
   *
   * @example
   * ```ts
   * type Plugin = EveryPlugin.Infer<"my-plugin">;
   * const plugin: Plugin = await runtime.usePlugin("my-plugin", config);
   * ```
   */
  export type Infer<K extends keyof RegisteredPlugins> = UsePluginResult<K>;
}

/**
 * Plugin runtime configuration
 */
export interface PluginRuntimeConfig<R extends RegisteredPlugins = RegisteredPlugins> {
  registry: PluginRegistry;
  secrets?: SecretsConfig;
  options?: RuntimeOptions;
}
