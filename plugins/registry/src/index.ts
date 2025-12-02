import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { Near } from "near-kit";

import { contract } from "./contract";
import { RegistryService } from "./service";

export * from "./schema";
export * from "./methods";

export default createPlugin({
  variables: z.object({
    network: z.enum(["mainnet", "testnet"]).default("testnet"),
  }),

  secrets: z.object({
    relayerAccountId: z.string().min(1, "Relayer account ID is required"),
    relayerPrivateKey: z.string().min(1, "Relayer private key is required"),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      const near = new Near({
        network: config.variables.network,
        privateKey: config.secrets.relayerPrivateKey as `ed25519:${string}`,
        defaultSignerId: config.secrets.relayerAccountId,
      });

      const service = new RegistryService(near, config.secrets.relayerAccountId);

      return { service };
    }),

  shutdown: () => Effect.void,

  createRouter: (context, builder) => {
    const { service } = context;

    return {
      publish: builder.publish.handler(async ({ input }) => {
        return await service.submitUpdateTx(input.payload);
      }),

      ping: builder.ping.handler(async () => {
        return {
          status: "ok" as const,
          timestamp: new Date().toISOString(),
        };
      }),
    };
  }
});
