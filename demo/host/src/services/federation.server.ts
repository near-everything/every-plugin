import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import { Context, Effect, Layer } from "effect";
import type { RuntimeConfig } from "./config";
import { ConfigService } from "./config";
import { FederationError } from "./errors";
import type { RouterModule } from "../types";

export type { RouterModule };

let federationInstance: ReturnType<typeof createInstance> | null = null;

function getOrCreateFederationInstance(config: RuntimeConfig) {
  if (federationInstance) return federationInstance;

  const existingInstance = getInstance();

  if (!config.ui.ssrUrl) {
    throw new FederationError({
      remoteName: config.ui.name,
      cause: new Error("SSR URL not configured. Set app.ui.ssr in bos.config.json to enable SSR."),
    });
  }

  if (existingInstance) {
    federationInstance = existingInstance;
    return federationInstance;
  }

  federationInstance = createInstance({
    name: "host",
    remotes: [
      {
        name: config.ui.name,
        entry: `${config.ui.ssrUrl}/remoteEntry.server.js`,
        alias: config.ui.name,
      },
    ],
  });

  setGlobalFederationInstance(federationInstance);
  return federationInstance;
}

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
  });

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
