import { Context, Effect, Layer, ManagedRuntime } from "effect";
import { type IPluginRuntime, PluginRuntime } from "../runtime";
import { PluginService, SecretsService } from "../runtime/services";
import type { PluginRegistry, PluginRuntimeConfig, RegistryBindings } from "../runtime/types";

// Import the mock service factory and types
import { createMockModuleFederationServiceLayer, type TestPluginMap } from "./mocks/module-federation.service";

// Create test logger
export const createTestLogger = () => ({
  logInfo: (message: string, context?: unknown) =>
    Effect.sync(() => console.log(`[INFO] ${message}`, context || '')),
  logWarning: (message: string, context?: unknown) =>
    Effect.sync(() => console.warn(`[WARNING] ${message}`, context || '')),
  logError: (message: string, error?: unknown, context?: unknown) =>
    Effect.sync(() => console.error(`[ERROR] ${message}`, error, context || '')),
  logDebug: (message: string, context?: unknown) =>
    Effect.sync(() => console.log(`[DEBUG] ${message}`, context || '')),
});

/**
 * Creates a test layer with mock ModuleFederationService for unit testing.
 * This layer provides all the necessary services for testing plugin runtime
 * without requiring real module federation infrastructure.
 */
export const createTestLayer = <R extends RegistryBindings = RegistryBindings>(
  config: PluginRuntimeConfig<R>,
  pluginMap: TestPluginMap
) => {
  const secrets = config.secrets || {};

  return Layer.effect(
    PluginRuntime,
    Effect.gen(function* () {
      const pluginService = yield* PluginService;

      return {
        loadPlugin: pluginService.loadPlugin,
        instantiatePlugin: pluginService.instantiatePlugin,
        initializePlugin: pluginService.initializePlugin,
        usePlugin: pluginService.usePlugin as IPluginRuntime<R>["usePlugin"],
        shutdown: () => pluginService.cleanup(),
      };
    }),
  ).pipe(
    Layer.provide(
      PluginService.Live(config.registry, secrets).pipe(
        Layer.provide(
          Layer.mergeAll(
            createMockModuleFederationServiceLayer(pluginMap),
            SecretsService.Live(secrets),
          )
        )
      )
    )
  );
};

/**
 * Creates a test plugin runtime using mock services.
 * This is similar to createPluginRuntime but uses MockModuleFederationService
 * instead of the real one, making it suitable for unit tests.
 */
export const createTestPluginRuntime = <R extends RegistryBindings = RegistryBindings>(
  config: PluginRuntimeConfig<R>,
  pluginMap: TestPluginMap
) => {
  const layer = createTestLayer<R>(config, pluginMap);
  const runtime = ManagedRuntime.make(layer);
  const TypedPluginRuntime = PluginRuntime as Context.Tag<PluginRuntime, IPluginRuntime<R>>;
  return { runtime, PluginRuntime: TypedPluginRuntime };
};

// Re-export useful types for tests
export type { PluginRegistry, PluginRuntimeConfig, TestPluginMap };
