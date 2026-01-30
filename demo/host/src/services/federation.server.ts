import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Context, Effect, Layer, Schedule } from "every-plugin/effect";
import type { RouterModule } from "../types";
import type { RuntimeConfig, SharedConfig } from "./config";
import { ConfigService } from "./config";
import { FederationError } from "./errors";

export type { RouterModule };

let federationInstance: ReturnType<typeof createInstance> | null = null;

function transformSharedConfig(sharedUi: Record<string, SharedConfig> | undefined) {
  if (!sharedUi) return undefined;

  return Object.fromEntries(
    Object.entries(sharedUi).map(([name, cfg]) => [
      name,
      {
        version: cfg.requiredVersion?.replace(/^[\^~>=<]+/, "") ?? "0.0.0",
        shareConfig: {
          singleton: cfg.singleton ?? true,
          requiredVersion: cfg.requiredVersion || false as const,
          eager: cfg.eager ?? false,
          strictVersion: cfg.strictVersion ?? false,
        },
      },
    ])
  );
}

function getOrCreateFederationInstance(config: RuntimeConfig) {
  if (federationInstance) return federationInstance;

  const existingInstance = getInstance();

  const ssrEntryUrl = config.ui.ssrUrl
    ? `${config.ui.ssrUrl}/remoteEntry.server.js`
    : `${config.ui.url}/remoteEntry.server.js`;

  if (!ssrEntryUrl) {
    throw new FederationError({
      remoteName: config.ui.name,
      cause: new Error("SSR URL not configured. Set app.ui.ssr in bos.config.json to enable SSR."),
    });
  }

  const shared = transformSharedConfig(config.shared?.ui);

  if (existingInstance) {
    existingInstance.registerRemotes([{
      name: config.ui.name,
      entry: ssrEntryUrl,
      alias: config.ui.name,
    }]);
    federationInstance = existingInstance;
    return federationInstance;
  }

  federationInstance = createInstance({
    name: "host",
    remotes: [
      {
        name: config.ui.name,
        entry: ssrEntryUrl,
        alias: config.ui.name,
      },
    ],
    // shared, DON'T UNCOMMENT
  });

  setGlobalFederationInstance(federationInstance);
  return federationInstance;
}

const isDev = process.env.NODE_ENV !== "production";

const retrySchedule = Schedule.exponential("500 millis").pipe(
  Schedule.compose(Schedule.recurs(isDev ? 15 : 3)),
  Schedule.tapOutput((count: number) =>
    Effect.logInfo(`[Federation] Retry attempt ${count + 1}...`)
  )
);

export const loadRouterModule = (config: RuntimeConfig) =>
  Effect.tryPromise({
    try: async () => {
      const mf = getOrCreateFederationInstance(config);
      const routerModule = await mf.loadRemote<RouterModule>(`${config.ui.name}/Router`);

      if (!routerModule) {
        throw new Error(`Failed to load Router module from ${config.ui.name}`);
      }

      return routerModule;
    },
    catch: (e) =>
      new FederationError({
        remoteName: config.ui.name,
        remoteUrl: config.ui.ssrUrl,
        cause: e,
      }),
  }).pipe(
    Effect.retry(retrySchedule),
    Effect.tapError((e) =>
      Effect.logError(`[Federation] Failed to load Router module after retries: ${e.message}`)
    )
  );

export class FederationServerService extends Context.Tag("host/FederationServerService")<
  FederationServerService,
  RouterModule
>() {
  static Live = Layer.effect(
    FederationServerService,
    Effect.gen(function* () {
      const config = yield* ConfigService;
      return yield* loadRouterModule(config);
    })
  ).pipe(Layer.provide(ConfigService.Default));
}
