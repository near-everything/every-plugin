import { Effect, Layer, ManagedRuntime } from "effect";
// Import the mock service factory and types
import { SecretsService, PluginService } from "../runtime/services";
import { PluginRuntime, PluginRuntimeService } from "../runtime";
import type { PluginRuntimeConfig, RegistryBindings } from "../types";
import { createMockModuleFederationServiceLayer, type TestPluginMap } from "./mocks/module-federation.service";


/**
 * Creates a test layer with mock ModuleFederationService for unit testing.
 * This mirrors PluginRuntimeService.Live but uses mock ModuleFederationService.
 */
export const createTestLayer = <R extends RegistryBindings = RegistryBindings>(
  config: PluginRuntimeConfig<R>,
  pluginMap: TestPluginMap
) => {
  const secrets = config.secrets || {};

  // Same structure as PluginRuntimeService.Live but with mock ModuleFederationService
  return Layer.scoped(
    PluginRuntimeService,
    Effect.gen(function* () {
      const pluginService = yield* PluginService;

      // Register cleanup finalizer for automatic resource management
      yield* Effect.addFinalizer(() =>
        pluginService.cleanup().pipe(
          Effect.catchAll(() => Effect.void) // Ensure cleanup never fails
        )
      );

      return pluginService;
    }),
  ).pipe(
    Layer.provide(
      PluginService.Live(config.registry, secrets).pipe(
        Layer.provide(
          Layer.mergeAll(
            createMockModuleFederationServiceLayer(pluginMap), // Mock instead of real
            SecretsService.Live(secrets),
          ),
        ),
      ),
    ),
  );
};

/**
 * Creates a test plugin runtime using mock services.
 * This mirrors createPluginRuntime exactly but uses test layer.
 */
export const createTestPluginRuntime = <R extends RegistryBindings = RegistryBindings>(
  config: PluginRuntimeConfig<R>,
  pluginMap: TestPluginMap
) => {
  const layer = createTestLayer<R>(config, pluginMap);
  const runtime = ManagedRuntime.make(layer);

  // Same exact pattern as createPluginRuntime
  const createTypedRuntime = Effect.gen(function* () {
    const pluginService = yield* PluginRuntimeService;
    return new PluginRuntime<R>(pluginService, config.registry);
  });

  return {
    runtime,
    PluginRuntime: createTypedRuntime.pipe(Effect.provide(runtime))
  };
};

// Re-export useful types for tests
export type { PluginRegistry, RegistryBindings } from "../types";
export type { PluginRuntimeConfig, TestPluginMap };

