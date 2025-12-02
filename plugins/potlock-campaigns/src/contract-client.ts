import { Context, Effect, Layer } from "every-plugin/effect";
import { Near } from "near-kit";
import {
  CampaignExternalSchema,
  DonationExternalSchema,
  ConfigSchema,
  type CampaignExternal,
  type DonationExternal,
  type ConfigExternal,
} from "./abi";

export class ContractClient extends Context.Tag("ContractClient")<
  ContractClient,
  {
    readonly fetchCampaignsPage: (opts: {
      fromIndex: number;
      limit: number;
    }) => Effect.Effect<CampaignExternal[], Error>;
    readonly fetchCampaignById: (
      id: number,
    ) => Effect.Effect<CampaignExternal, Error>;
    readonly fetchDonationsForCampaign: (opts: {
      campaignId: number;
      fromIndex: number;
      limit: number;
    }) => Effect.Effect<DonationExternal[], Error>;
    readonly fetchContractConfig: () => Effect.Effect<
      ConfigExternal,
      Error
    >;
    readonly near: Near;
    readonly contractId: string;
  }
>() {}

export const ContractClientLive = (params: {
  fastNearRpcUrl: string;
  campaignContractId: string;
  network: "mainnet" | "testnet";
}) =>
  Layer.effect(
    ContractClient,
    Effect.gen(function* () {
      const near = new Near({
        network: {
          networkId: params.network,
          rpcUrl: params.fastNearRpcUrl,
        },
      });

      const contractId = params.campaignContractId;

      const view = <T>(
        method: string,
        args: Record<string, unknown>,
        schema: { parse: (val: unknown) => T },
      ): Effect.Effect<T, Error> =>
        Effect.tryPromise({
          try: async () => {
            const raw = await near.view<unknown>(
              contractId,
              method,
              args,
            );
            return schema.parse(raw);
          },
          catch: (e) =>
            new Error(
              `view ${method} failed: ${String(e)}`,
            ),
        });

      return {
        near,
        contractId,

        fetchCampaignsPage: ({ fromIndex, limit }) =>
          view(
            "get_campaigns",
            {
              from_index: fromIndex,
              limit,
            },
            CampaignExternalSchema.array(),
          ),

        fetchCampaignById: (id) =>
          view(
            "get_campaign",
            { campaign_id: id },
            CampaignExternalSchema,
          ),

        fetchDonationsForCampaign: ({
          campaignId,
          fromIndex,
          limit,
        }) =>
          view(
            "get_donations_for_campaign",
            {
              campaign_id: campaignId,
              from_index: fromIndex,
              limit,
            },
            DonationExternalSchema.array(),
          ),

        fetchContractConfig: () =>
          view("get_config", {}, ConfigSchema),
      };
    }),
  );
