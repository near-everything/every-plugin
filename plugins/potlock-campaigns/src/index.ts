import { createPlugin } from "every-plugin";
import { Effect, Layer } from "every-plugin/effect";
import { z } from "every-plugin/zod";

import { contract } from "./contract";
import {
  DatabaseLive,
  CampaignStoreLive,
} from "./store";
import { ContractClientLive } from "./contract-client";
import { CampaignIndexerLive } from "./indexer";
import {
  CampaignService,
  CampaignServiceLive,
} from "./service";

export default createPlugin({
  contract,

  variables: z.object({
    FASTNEAR_RPC_URL: z
      .string()
      .url()
      .describe("FastNEAR RPC URL"),
    CAMPAIGN_CONTRACT_ID: z
      .string()
      .describe("Potlock campaign contract"),
    SYNC_ON_STARTUP: z.boolean().default(true),
  }),

  secrets: z.object({
    DATABASE_URL: z
      .string()
      .default("file:./campaigns.db"),
    DATABASE_AUTH_TOKEN: z.string().optional(),
    NEAR_NETWORK: z
      .enum(["mainnet", "testnet"])
      .default("testnet"),
    NEAR_PRIVATE_KEY: z.string(),
    NEAR_SIGNER_ID: z.string(),
  }),

  initialize: (config) =>
    Effect.gen(function* () {
      const dbLayer = DatabaseLive(
        config.secrets.DATABASE_URL,
        config.secrets.DATABASE_AUTH_TOKEN,
      );

      const contractLayer = ContractClientLive({
        fastNearRpcUrl: config.variables.FASTNEAR_RPC_URL,
        campaignContractId:
          config.variables.CAMPAIGN_CONTRACT_ID,
        network: config.secrets.NEAR_NETWORK,
      });

      const serviceLayer = CampaignServiceLive({
        network: config.secrets.NEAR_NETWORK,
        privateKey: config.secrets.NEAR_PRIVATE_KEY,
        signerId: config.secrets.NEAR_SIGNER_ID,
        contractId: config.variables.CAMPAIGN_CONTRACT_ID,
      });

      const AppLayer = serviceLayer.pipe(
        Layer.provide(CampaignIndexerLive),
        Layer.provide(contractLayer),
        Layer.provide(CampaignStoreLive),
        Layer.provide(dbLayer),
      );

      if (config.variables.SYNC_ON_STARTUP) {
        yield* Effect.gen(function* () {
          const svc = yield* CampaignService;
          yield* Effect.forkDaemon(
            svc.sync(false),
          );
        }).pipe(Effect.provide(AppLayer));
      }

      console.log("Campaign Indexer plugin initialized");

      return { appLayer: AppLayer, config };
    }),

  shutdown: () => Effect.void,

  createRouter: (context, builder) => ({
    listCampaigns: builder.listCampaigns.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.listCampaigns(input);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    getCampaign: builder.getCampaign.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.getCampaign(input.id);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    listCampaignDonations:
      builder.listCampaignDonations.handler(
        async ({ input, errors }) => {
          return await Effect.runPromise(
            Effect.gen(function* () {
              const svc = yield* CampaignService;
              return yield* svc.listDonations(input);
            }).pipe(Effect.provide(context.appLayer)),
          ).catch((e) => {
            throw errors.SERVICE_UNAVAILABLE({
              message: String(e),
              data: {},
            });
          });
        },
      ),

    listAllDonations: builder.listAllDonations.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.listDonations(input);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    sync: builder.sync.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.sync(input.full);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    getSyncStatus: builder.getSyncStatus.handler(
      async ({ errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.getSyncStatus();
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    getContractConfig:
      builder.getContractConfig.handler(
        async ({ errors }) => {
          return await Effect.runPromise(
            Effect.gen(function* () {
              const svc = yield* CampaignService;
              return yield* svc.getContractConfig();
            }).pipe(Effect.provide(context.appLayer)),
          ).catch((e) => {
            throw errors.SERVICE_UNAVAILABLE({
              message: String(e),
              data: {},
            });
          });
        },
      ),

    ping: builder.ping.handler(async () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    })),

    prepareCreateCampaign: builder.prepareCreateCampaign.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.prepareCreateCampaign(input);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),

    createCampaign: builder.createCampaign.handler(
      async ({ input, errors }) => {
        return await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CampaignService;
            return yield* svc.createCampaign(input.signedPayload);
          }).pipe(Effect.provide(context.appLayer)),
        ).catch((e) => {
          throw errors.SERVICE_UNAVAILABLE({
            message: String(e),
            data: {},
          });
        });
      },
    ),
  }),
});
