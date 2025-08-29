import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";
import * as EffectModule from "effect";
import { Context, Effect, Layer } from "effect";
import * as ZodModule from "zod";

type ModuleFederation = ReturnType<typeof createInstance>;

export class ModuleFederationTag extends Context.Tag("ModuleFederation")<
  ModuleFederationTag,
  ModuleFederation
>() { }

// Cached effect that ensures single instance creation
const createModuleFederationInstance = Effect.cached(
  Effect.sync(() => {
    try {
      let instance = getInstance();

      if (!instance) {
        instance = createInstance({
          name: "host",
          remotes: [],
          shared: {
            "effect": {
              shareConfig: {
                singleton: true,
                requiredVersion: "^3.17.6",
                eager: true,
              },
              lib: () => EffectModule,
            },
            "zod": {
              shareConfig: {
                singleton: true,
                requiredVersion: "^4.0.8",
                eager: true,
              },
              lib: () => ZodModule,
            }
          }
        });

        // // ensure the runtime can locate this instance globally
        setGlobalFederationInstance(instance);
      }

      return instance;
    } catch (error) {
      throw new Error(`Failed to initialize Module Federation: ${error}`);
    }
  })
);

export const ModuleFederationLive = Layer.effect(
  ModuleFederationTag,
  Effect.flatten(createModuleFederationInstance)
);
