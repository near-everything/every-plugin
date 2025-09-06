import { Effect, Layer, ManagedRuntime } from "effect";
import { PluginLoggerTag, type PluginRegistry } from "../plugin";
import { PluginRuntime } from "../runtime";
import { PluginService, SecretsService } from "../runtime/services";
import type { PluginRuntimeConfig } from "../runtime/types";

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
export const createTestLayer = (config: PluginRuntimeConfig, pluginMap: TestPluginMap) => {
  const secrets = config.secrets || {};
  const logger = config.logger || createTestLogger();

  return Layer.effect(
    PluginRuntime,
    Effect.gen(function* () {
      const pluginService = yield* PluginService;

      return {
        loadPlugin: pluginService.loadPlugin,
        instantiatePlugin: pluginService.instantiatePlugin,
        initializePlugin: pluginService.initializePlugin,
        executePlugin: pluginService.executePlugin,
        usePlugin: pluginService.usePlugin,
        streamPlugin: pluginService.streamPlugin,
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
            Layer.succeed(PluginLoggerTag, logger),
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
export const createTestPluginRuntime = (config: PluginRuntimeConfig, pluginMap: TestPluginMap) =>
  ManagedRuntime.make(createTestLayer(config, pluginMap));

// Re-export useful types for tests
export type { PluginRegistry, PluginRuntimeConfig, TestPluginMap };
