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
 * Extract plugin type from registered plugins by key
 */
export type RegisteredPlugin<K extends keyof RegisteredPlugins> =
  RegisteredPlugins[K] extends { binding: infer B }
  ? B extends {
    contract: infer C extends AnyContractRouter;
    variables: infer V extends AnySchema;
    secrets: infer S extends AnySchema;
    context: infer TContext extends Context;
  }
  ? Plugin<C, V, S, TContext>
  : never
  : never;


/**
 * Extract router type from plugin binding
 */
export type PluginRouterType<T> = Router<PluginContract<T>, any>;

/**
 * Extract client type from plugin binding
 */
export type PluginClientType<T> = RouterClient<Router<PluginContract<T>, any>>;

export type PluginContract<T> = T extends { binding: { contract: infer C extends AnyContractRouter } } ? C : never;
export type PluginVariables<T> = T extends { binding: { variables: infer V extends AnySchema } } ? V : never;
export type PluginSecrets<T> = T extends { binding: { secrets: infer S extends AnySchema } } ? S : never;
export type PluginContext<T> = T extends { binding: { context: infer C extends Context } } ? C : never;

/**
 * Extract config input type from plugin binding
 */
export type PluginConfigInput<T> = {
  variables: InferSchemaInput<PluginVariables<T>>;
  secrets: InferSchemaInput<PluginSecrets<T>>;
};


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
type VerifyPluginBinding<K extends keyof RegisteredPlugins> =
  RegisteredPlugins[K] extends { binding: infer B }
  ? B extends {
    contract: AnyContractRouter;
    variables: AnySchema;
    secrets: AnySchema;
    context: Context;
  }
  ? true
  : `❌ Plugin "${K & string}" is not properly registered. Ensure it extends plugin binding layout { contract, variables, secrets, context }.`
  : `❌ Plugin "${K & string}" is not properly registered. Missing binding property.`;

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
