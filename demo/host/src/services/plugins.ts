import { Context, Effect, Layer } from "effect";
import { createPluginRuntime } from "every-plugin";
import { ConfigService } from "./config";
import { PluginError } from "./errors";

export interface PluginStatus {
  available: boolean;
  pluginName: string | null;
  error: string | null;
  errorDetails: string | null;
}

export interface PluginResult {
  runtime: ReturnType<typeof createPluginRuntime> | null;
  api: unknown;
  status: PluginStatus;
}

function secretsFromEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

const unavailableResult = (
  pluginName: string | null,
  error: string | null,
  errorDetails: string | null
): PluginResult => ({
  runtime: null,
  api: null,
  status: { available: false, pluginName, error, errorDetails },
});

export const initializePlugins = Effect.gen(function* () {
  const config = yield* ConfigService;
  const pluginConfig = config.api;
  const pluginName = pluginConfig.name;
  const pluginUrl = pluginConfig.url;

  console.log(`[Plugins] Registering remote: ${pluginName} from ${pluginUrl}`);

  const result = yield* Effect.tryPromise({
    try: async () => {
      const runtime = createPluginRuntime({
        registry: {
          [pluginName]: {
            remote: pluginUrl,
          },
        },
        secrets: {},
      });

      const secrets = pluginConfig.secrets ? secretsFromEnv(pluginConfig.secrets) : {};
      const variables = pluginConfig.variables ?? {};

      const api = await runtime.usePlugin(pluginName, {
        // @ts-expect-error no plugin types loaded
        variables,
        // @ts-expect-error no plugin types loaded
        secrets,
      });

      return {
        runtime,
        api,
        status: {
          available: true,
          pluginName,
          error: null,
          errorDetails: null,
        },
      } satisfies PluginResult;
    },
    catch: (error) =>
      new PluginError({
        pluginName,
        pluginUrl,
        cause: error,
      }),
  });

  return result;
}).pipe(
  Effect.catchAll((error) => {
    const pluginName = error instanceof PluginError ? error.pluginName : null;
    const pluginUrl = error instanceof PluginError ? error.pluginUrl : null;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Plugins] ❌ Failed to initialize plugin");
    console.error(`[Plugins] Plugin: ${pluginName}`);
    console.error(`[Plugins] URL: ${pluginUrl}`);
    console.error(`[Plugins] Error: ${errorMessage}`);
    console.warn("[Plugins] Server will continue without plugin functionality");

    return Effect.succeed(unavailableResult(pluginName ?? null, errorMessage, errorStack ?? null));
  })
);

export class PluginsService extends Context.Tag("host/PluginsService")<
  PluginsService,
  PluginResult
>() {
  static Live = Layer.scoped(
    PluginsService,
    Effect.gen(function* () {
      const plugins = yield* initializePlugins;

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (plugins.runtime) {
            console.log("[Plugins] Shutting down plugin runtime...");
            plugins.runtime.shutdown();
          }
        })
      );

      return plugins;
    })
  ).pipe(Layer.provide(ConfigService.Default));
}
