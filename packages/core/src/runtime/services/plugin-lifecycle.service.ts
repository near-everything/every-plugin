import { Context, Effect, Layer, Ref } from "effect";
import { type PluginRuntimeError, toPluginRuntimeError } from "../errors";
import type { AnyPlugin, InitializedPlugin } from "../types";

export interface IPluginLifecycleService {
  readonly register: <T extends AnyPlugin>(
    plugin: InitializedPlugin<T>,
  ) => Effect.Effect<void, never>;
  readonly unregister: (
    plugin: InitializedPlugin<AnyPlugin>,
  ) => Effect.Effect<void, never>;
  readonly shutdown: (
    plugin: InitializedPlugin<AnyPlugin>,
  ) => Effect.Effect<void, PluginRuntimeError>;
  readonly cleanup: () => Effect.Effect<void, never>;
}

export class PluginLifecycleService extends Context.Tag("PluginLifecycleService")<
  PluginLifecycleService,
  IPluginLifecycleService
>() {
  static Live = Layer.effect(
    PluginLifecycleService,
    Effect.gen(function* () {
      const activePlugins = yield* Ref.make(new Set<InitializedPlugin<AnyPlugin>>());

      return {
        register: <T extends AnyPlugin>(plugin: InitializedPlugin<T>) =>
          Ref.update(activePlugins, plugins =>
            new Set(plugins).add(plugin as InitializedPlugin<AnyPlugin>)
          ),

        unregister: (plugin: InitializedPlugin<AnyPlugin>) =>
          Ref.update(activePlugins, plugins => {
            const newSet = new Set(plugins);
            newSet.delete(plugin);
            return newSet;
          }),

        shutdown: (plugin: InitializedPlugin<AnyPlugin>) =>
          Effect.gen(function* () {
            // Remove from active plugins
            yield* Ref.update(activePlugins, plugins => {
              const newSet = new Set(plugins);
              newSet.delete(plugin);
              return newSet;
            });

            // Shutdown the plugin
            yield* plugin.plugin.shutdown().pipe(
              Effect.mapError(error =>
                toPluginRuntimeError(error, plugin.plugin.id, undefined, "shutdown-plugin", false)
              )
            );
          }),

        cleanup: () =>
          Effect.gen(function* () {
            const plugins = yield* Ref.get(activePlugins);

            // Shutdown all active plugins concurrently
            yield* Effect.forEach(
              plugins,
              plugin =>
                plugin.plugin.shutdown().pipe(
                  Effect.mapError(error =>
                    toPluginRuntimeError(error, plugin.plugin.id, undefined, "cleanup-shutdown", false)
                  ),
                  Effect.catchAll(error =>
                    Effect.logError(
                      `Failed to shutdown plugin ${plugin.plugin.id} during cleanup`,
                      error,
                      { pluginId: plugin.plugin.id }
                    )
                  )
                ),
              { concurrency: "unbounded" }
            );

            // Clear the active plugins set
            yield* Ref.set(activePlugins, new Set());
          }).pipe(
            Effect.catchAll(() => Effect.void) // Convert errors to void for cleanup
          ),
      };
    }),
  );
}

export const PluginLifecycleServiceTag = PluginLifecycleService;
export const PluginLifecycleServiceLive = PluginLifecycleService.Live;
