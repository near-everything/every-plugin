import { Context, Effect, Layer } from "every-plugin/effect";
import {
  CampaignType,
  CampaignDonationType,
  CreateCampaignInput,
} from "./contract";
import { z } from "every-plugin/zod";
import { CampaignStore } from "./store";
import { CampaignIndexer } from "./indexer";
import { ContractClient } from "./contract-client";
import { Near, decodeSignedDelegateAction } from "near-kit";
import { CampaignExternalSchema } from "./abi";

export class CampaignService extends Context.Tag("CampaignService")<
  CampaignService,
  {
    readonly listCampaigns: (
      input: {
        cursor?: string;
        limit: number;
        ownerId?: string;
        recipientId?: string;
        tokenAccountId?: string;
        status?: string;
      },
    ) => Effect.Effect<
      { items: CampaignType[]; nextCursor: string | null },
      Error
    >;
    readonly getCampaign: (
      id: number,
    ) => Effect.Effect<CampaignType | null, Error>;
    readonly listDonations: (
      filters: {
        cursor?: string;
        limit: number;
        id?: number;
        donorId?: string;
        excludeRefunded?: boolean;
      },
    ) => Effect.Effect<
      {
        items: CampaignDonationType[];
        nextCursor: string | null;
      },
      Error
    >;
    readonly sync: (
      full: boolean,
    ) => Effect.Effect<{ status: string }, Error>;
    readonly getSyncStatus: () => Effect.Effect<
      {
        status: "idle" | "running" | "error";
        lastSuccessAt: number | null;
        lastErrorAt: number | null;
        errorMessage: string | null;
      },
      Error
    >;
    readonly getContractConfig: () => Effect.Effect<
      Record<string, unknown>,
      Error
    >;
    readonly prepareCreateCampaign: (
      input: z.infer<typeof CreateCampaignInput>,
    ) => Effect.Effect<
      {
        contractId: string;
        methodName: string;
        args: Record<string, unknown>;
        deposit: string;
        gas: string;
      },
      Error
    >;
    readonly createCampaign: (
      signedPayload: string,
    ) => Effect.Effect<
      { transactionHash: string; campaignOnChainId?: number },
      Error
    >;
  }
>() {}

export const CampaignServiceLive = (relayerCfg: {
  network: "mainnet" | "testnet";
  privateKey: string;
  signerId: string;
  contractId: string;
}) =>
  Layer.effect(
    CampaignService,
    Effect.gen(function* () {
      const store = yield* CampaignStore;
      const indexer = yield* CampaignIndexer;
      const contractClient = yield* ContractClient;

      const relayerNear = new Near({
        network: relayerCfg.network,
        privateKey: relayerCfg.privateKey as `ed25519:${string}`,
        defaultSignerId: relayerCfg.signerId,
      });

      const computeStatus = (
        c: CampaignType,
      ): CampaignType => {
        const now = Date.now();
        const start = Date.parse(c.startAt);
        const end = c.endAt ? Date.parse(c.endAt) : null;

        if (start > now) return { ...c, status: "upcoming" };

        if (end !== null && end <= now) {
          return { ...c, status: "ended" };
        }

        if (c.maxAmount) {
          try {
            const net = BigInt(c.netRaisedAmount);
            const max = BigInt(c.maxAmount);
            if (net >= max) {
              return { ...c, status: "ended" };
            }
          } catch {
            // ignore parse issues
          }
        }

        return { ...c, status: "active" };
      };

      return {
        listCampaigns: (input) =>
          store
            .listCampaigns(input)
            .pipe(
              Effect.map((res) => ({
                items: res.items.map(computeStatus),
                nextCursor: res.nextCursor,
              })),
            ),

        getCampaign: (id) =>
          store.getCampaignByOnChainId(id).pipe(
            Effect.map((c) => (c ? computeStatus(c) : null)),
          ),

        listDonations: (filters) =>
          store.listDonations(filters),

        sync: (full) =>
          Effect.gen(function* () {
            if (full) {
              yield* indexer.backfillOnce();
            } else {
              yield* indexer.startBackgroundIndexing();
            }
            return { status: "started" };
          }),

        getSyncStatus: () => store.getSyncState(),

        getContractConfig: () =>
          contractClient.fetchContractConfig().pipe(
            Effect.map((config) => config as Record<string, unknown>),
          ),

        prepareCreateCampaign: (input) =>
          Effect.succeed({
            contractId: relayerCfg.contractId,
            methodName: "create_campaign",
            args: {
              name: input.name,
              description: input.description ?? null,
              cover_image_url: input.coverImageUrl ?? null,
              recipient: input.recipientId,
              start_ms: input.startMs,
              end_ms: input.endMs ?? null,
              ft_id: input.ftAccountId ?? null,
              target_amount: input.targetAmount,
              min_amount: input.minAmount ?? null,
              max_amount: input.maxAmount ?? null,
              referral_fee_basis_points: input.referralFeeBps,
              creator_fee_basis_points: input.creatorFeeBps,
              allow_fee_avoidance: input.allowFeeAvoidance,
            },
            deposit: input.storageDeposit,
            gas: "100 Tgas",
          }),

        createCampaign: (signedPayload) =>
          Effect.tryPromise({
            try: async () => {
              const userAction = decodeSignedDelegateAction(signedPayload);

              const tx = await relayerNear
                .transaction(relayerCfg.signerId)
                .signedDelegateAction(userAction)
                .send();

              const txHash = tx.transaction.hash;

              let campaignId: number | undefined;

              const status = tx.status as any;
              if (status && typeof status === "object" && "SuccessValue" in status) {
                const val = status.SuccessValue;
                if (val) {
                  const json = Buffer.from(val, "base64").toString();

                  try {
                    const raw = JSON.parse(json);
                    const parsed = CampaignExternalSchema.parse(raw);
                    campaignId = parsed.id;
                  } catch (e) {
                    console.warn(
                      "[createCampaign] Failed to parse CampaignExternal from SuccessValue:",
                      e,
                    );
                  }
                }
              }

              if (campaignId !== undefined) {
                await Effect.runPromise(
                  indexer.syncCampaignById(campaignId),
                );
              }

              return {
                transactionHash: txHash,
                campaignOnChainId: campaignId,
              };
            },
            catch: (e) =>
              new Error(`create_campaign relay failed: ${String(e)}`),
          }),
      };
    }),
  );
