import type { AnyContractRouter, AnySchema, InferSchemaInput, InferSchemaOutput } from "@orpc/contract";
import type { Context, Router, RouterClient } from "@orpc/server";
import type { Scope } from "effect";
import type { Plugin } from "./plugin";

/**
 * Registry bindings interface - populated via module augmentation
 * Only needed for remote-only plugin entries.
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
export type AnyPlugin = Plugin<AnyContractRouter, AnySchema, AnySchema, AnySchema | undefined, any>;

/**
 * Loaded plugin constructor with binding information
 */
export type AnyPluginConstructor = {
	new(): AnyPlugin;
	binding: {
		contract: AnyContractRouter;
		variables: AnySchema;
		secrets: AnySchema;
		context: AnySchema | undefined;
	};
};

/**
 * Registry entry that supports both direct module imports and remote URLs
 */
export type PluginRegistryEntry = 
	| { module: AnyPluginConstructor; remote?: string; version?: string; description?: string }
	| { remote: string; version?: string; description?: string };

/**
 * Extract plugin constructor type from registry entry
 */
export type ExtractPluginType<E> = E extends { module: infer M } ? M : never;

/**
 * Infer registry types from plugin entries with module constructors
 */
export type InferRegistryFromEntries<R extends Record<string, PluginRegistryEntry>> = {
	[K in keyof R]: R[K] extends { module: infer M } ? M : 
		K extends keyof RegisteredPlugins ? RegisteredPlugins[K] : never
};

/**
* Extract contract type from plugin binding
*/
export type PluginContract<T> = T extends { binding: { contract: infer C extends AnyContractRouter } } ? C : never;

/**
 * Extract variables type from plugin binding
 */
export type PluginVariables<T> = T extends { binding: { variables: infer V extends AnySchema } } ? V : never;

/**
 * Extract secrets type from plugin binding
 */
export type PluginSecrets<T> = T extends { binding: { secrets: infer S extends AnySchema } } ? S : never;

/**
 * Extract context schema type from plugin binding
 */
export type PluginContext<T> = T extends { binding: { context: infer C extends AnySchema | undefined } } ? C : never;

/**
 * Extract router type from plugin binding
 * Uses 'any' for context to support nested router compositions
 */
export type PluginRouterType<T> = Router<PluginContract<T>, any>;

/**
 * Extract client type from plugin binding
 */
export type PluginClientType<T> = RouterClient<PluginRouterType<T>>;

/**
 * Extract plugin type from registered plugins by key
 * @param K - The plugin key
 * @param R - The registry type (defaults to RegisteredPlugins for module augmentation pattern)
 */
export type RegisteredPlugin<K extends keyof R, R = RegisteredPlugins> =
  R[K] extends { binding: infer B }
  ? B extends {
    contract: infer C extends AnyContractRouter;
    variables: infer V extends AnySchema;
    secrets: infer S extends AnySchema;
    context: infer TRequestContext extends AnySchema | undefined;
  }
  ? Plugin<C, V, S, TRequestContext, any>
  : never
  : never;

/**
 * Extract plugin constructor type from registry entry
 */
export type PluginConstructor<K extends keyof R, R = RegisteredPlugins> = RegisteredPlugin<K, R>;

/**
 * Extract context input type from plugin binding (for client creation)
 */
export type PluginContextInput<T> = PluginContext<T> extends AnySchema ? InferSchemaInput<PluginContext<T>> : never;

/**
 * Extract config input type from plugin binding
 */
export type PluginConfigInput<T> = {
  variables: InferSchemaInput<PluginVariables<T>>;
  secrets: InferSchemaInput<PluginSecrets<T>>;
};


/**
 * Extract deps context type from plugin instance (used for initialization)
 */
export type ContextOf<T extends AnyPlugin> =
  T extends Plugin<AnyContractRouter, AnySchema, AnySchema, AnySchema | undefined, infer TDeps>
  ? TDeps
  : never;

/**
 * Plugin metadata for remote loading
 */
export type PluginMetadata = {
	readonly remoteUrl: string;
	readonly version?: string;
	readonly description?: string;
};

/**
 * Runtime registry configuration supporting both module and remote entries
 */
export type PluginRegistry = Record<string, PluginRegistryEntry>;

/**
 * Legacy metadata-only registry (for backwards compatibility)
 */
export type PluginMetadataRegistry = Record<string, PluginMetadata>;

/**
 * Configuration for secrets injection.
 * Secrets are hydrated into plugin configs using template replacement.
 */
export interface SecretsConfig {
	[key: string]: string;
}

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
type VerifyPluginBinding<K extends keyof R, R = RegisteredPlugins> =
  R[K] extends { binding: infer B }
  ? B extends {
    contract: AnyContractRouter;
    variables: AnySchema;
    secrets: AnySchema;
    context: AnySchema | undefined;
  }
  ? true
  : `❌ Plugin "${K & string}" is not properly registered. Ensure it extends plugin binding layout { contract, variables, secrets, context }.`
  : `❌ Plugin "${K & string}" is not properly registered. Missing binding property.`;

/**
* Result of runtime.usePlugin() call
* @param K - The plugin key
* @param R - The registry type (defaults to RegisteredPlugins for module augmentation pattern)
*/
export type UsePluginResult<K extends keyof R, R = RegisteredPlugins> = VerifyPluginBinding<K, R> extends true
  ? {
    readonly createClient: (context?: PluginContextInput<R[K]>) => PluginClientType<R[K]>;
    readonly router: PluginRouterType<R[K]>;
    readonly metadata: PluginMetadata;
    readonly initialized: InitializedPlugin<RegisteredPlugin<K, R>>;
  }
  : VerifyPluginBinding<K, R>;

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
 * Extract registry type from runtime instance or use type directly
 * This allows EveryPlugin.Infer to work with both:
 * - typeof runtime (extracts registry from PluginRuntime<R> via __registryType)
 * - Registry types directly
 */
type RegistryOf<T> = T extends { __registryType?: infer R } ? R : T;

/**
 * Namespace containing type utilities for working with plugin results.
 */
export namespace EveryPlugin {
  /**
   * Extract plugin runtime instance type from registered plugins or runtime.
   * Provides full type safety for plugin clients, routers, and metadata.
   *
   * @example
   * ```ts
   * // From RegisteredPlugins (module augmentation)
   * type Plugin = EveryPlugin.Infer<"my-plugin">;
   * 
   * // From runtime instance (when using module entries)
   * const runtime = createPluginRuntime({ registry: { "my-plugin": { module: MyPlugin } } });
   * type Plugin = EveryPlugin.Infer<"my-plugin", typeof runtime>;
   * 
   * // From explicit registry type
   * type Plugin = EveryPlugin.Infer<"my-plugin", MyRegistryType>;
   * ```
   */
  export type Infer<K extends string, Source = RegisteredPlugins> = 
    K extends keyof RegistryOf<Source> 
      ? UsePluginResult<K, RegistryOf<Source>> 
      : never;
}

/**
 * Plugin runtime configuration with support for both module and remote entries
 */
export interface PluginRuntimeConfig<R extends Record<string, PluginRegistryEntry> = Record<string, PluginRegistryEntry>> {
	registry: R;
	secrets?: SecretsConfig;
	options?: RuntimeOptions;
}

/**
 * Legacy plugin runtime configuration (metadata-only registry)
 * @deprecated Use PluginRuntimeConfig with module/remote entries instead
 */
export interface LegacyPluginRuntimeConfig {
	registry: PluginMetadataRegistry;
	secrets?: SecretsConfig;
	options?: RuntimeOptions;
}
