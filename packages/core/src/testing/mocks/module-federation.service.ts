import { Effect, Layer } from "effect";
import { ModuleFederationError } from "../../runtime/errors";
import type { IModuleFederationService } from "../../runtime/services/module-federation.service";
import { ModuleFederationService } from "../../runtime/services/module-federation.service";
import type { AnyPlugin } from "../../types";

export interface TestPluginMap {
  [pluginId: string]: new () => AnyPlugin;
}

// Create the mock service implementation
const createMockService = (pluginMap: TestPluginMap): IModuleFederationService => ({
  registerRemote: (pluginId: string, url: string) =>
    Effect.gen(function* () {

      // Mock registration - succeeds if plugin is in the map
      // Use original pluginId as key since TestPluginMap uses original plugin IDs
      if (pluginId in pluginMap) {
        return;
      }

      // Fail for plugins not in the map
      return yield* Effect.fail(
        new ModuleFederationError({
          pluginId,
          remoteUrl: url,
          cause: new Error(`Mock: Plugin ${pluginId} not available in test plugin map`),
        }),
      );
    }),

  loadRemoteConstructor: (pluginId: string, url: string) =>
    Effect.gen(function* () {

      // Return the plugin constructor from the map
      // Use original pluginId as key since TestPluginMap uses original plugin IDs
      const PluginConstructor = pluginMap[pluginId];
      if (PluginConstructor) {
        return PluginConstructor;
      }

      // Fail for plugins not in the map
      return yield* Effect.fail(
        new ModuleFederationError({
          pluginId,
          remoteUrl: url,
          cause: new Error(`Mock: Constructor for ${pluginId} not found in test plugin map`),
        }),
      );
    }),
});

// Create a Layer that provides the mock ModuleFederationService
export const createMockModuleFederationServiceLayer = (pluginMap: TestPluginMap) =>
  Layer.succeed(ModuleFederationService, createMockService(pluginMap));
