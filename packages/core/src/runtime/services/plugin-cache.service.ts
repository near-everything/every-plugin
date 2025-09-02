import { Cache, Duration, Effect, Layer } from "effect";
import { PluginRuntimeError } from "../errors";
import type { PluginConstructor } from "../types";
import { ModuleFederationService } from "./module-federation.service";

export interface IPluginCacheService {
  readonly getCachedConstructor: (
    cacheKey: string,
  ) => Effect.Effect<PluginConstructor, PluginRuntimeError>;
  readonly invalidate: (cacheKey: string) => Effect.Effect<void>;
}

export class PluginCacheService extends Effect.Tag("PluginCacheService")<
  PluginCacheService,
  IPluginCacheService
>() {
  static Live = Layer.effect(
    PluginCacheService,
    Effect.gen(function* () {
      const mfService = yield* ModuleFederationService;

    const cache = yield* Cache.make({
      capacity: 50,
      timeToLive: Duration.minutes(30),
      lookup: (cacheKey: string) => {
        // Parse cache key: "pluginId:url"
        const colonIndex = cacheKey.indexOf(":");
        if (colonIndex === -1) {
          return Effect.fail(
            new PluginRuntimeError({
              pluginId: cacheKey,
              operation: "cache-lookup",
              cause: new Error(`Invalid cache key format: ${cacheKey}`),
              retryable: false,
            }),
          );
        }

        const pluginId = cacheKey.substring(0, colonIndex);
        const url = cacheKey.substring(colonIndex + 1);

        return Effect.gen(function* () {
          yield* mfService.registerRemote(pluginId, url).pipe(
            Effect.mapError(
              (mfError): PluginRuntimeError =>
                new PluginRuntimeError({
                  pluginId,
                  operation: "register-remote",
                  cause: mfError.cause,
                  retryable: true,
                }),
            ),
          );

          const ctor = yield* mfService.loadRemoteConstructor(pluginId, url).pipe(
            Effect.mapError(
              (mfError): PluginRuntimeError =>
                new PluginRuntimeError({
                  pluginId,
                  operation: "load-remote",
                  cause: mfError.cause,
                  retryable: true,
                }),
            ),
          );

          return {
            ctor,
            metadata: {
              pluginId,
              version: "unknown", // Will be resolved from registry
              description: "Loaded from remote",
              type: "unknown" as const,
            },
          } satisfies PluginConstructor;
        });
      },
    });

      return {
        getCachedConstructor: (cacheKey: string) => cache.get(cacheKey),
        invalidate: (cacheKey: string) => cache.invalidate(cacheKey),
      };
    }),
  );
}

export const PluginCacheServiceTag = PluginCacheService;
export const PluginCacheServiceLive = PluginCacheService.Live;
