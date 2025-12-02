import { Context, Effect, Layer } from "every-plugin/effect";
import { ContractClient } from "./contract-client";
import { CampaignStore } from "./store";
import type {
  CampaignType,
  CampaignDonationType,
} from "./contract";
import type {
  CampaignExternal,
  DonationExternal,
} from "./abi";

export class CampaignIndexer extends Context.Tag("CampaignIndexer")<
  CampaignIndexer,
  {
    readonly backfillOnce: () => Effect.Effect<void, Error>;
    readonly syncCampaignById: (
      id: number,
    ) => Effect.Effect<void, Error>;
    readonly syncDonationsForCampaign: (
      id: number,
    ) => Effect.Effect<void, Error>;
    readonly startBackgroundIndexing: () => Effect.Effect<
      void,
      Error
    >;
  }
>() {}

export const CampaignIndexerLive = Layer.effect(
  CampaignIndexer,
  Effect.gen(function* () {
    const contractClient = yield* ContractClient;
    const store = yield* CampaignStore;

    const toIso = (ms: number | null) =>
      ms === null ? null : new Date(ms).toISOString();

    const mapCampaign = (
      raw: CampaignExternal,
    ): CampaignType => ({
      onChainId: raw.id,
      name: raw.name,
      description: raw.description,
      coverImageUrl: raw.cover_image_url,
      ownerId: raw.owner,
      recipientId: raw.recipient,
      tokenAccountId: raw.ft_id,
      startAt: toIso(raw.start_ms)!,
      endAt: toIso(raw.end_ms),
      createdAt: toIso(raw.created_ms)!,
      targetAmount: raw.target_amount,
      minAmount: raw.min_amount,
      maxAmount: raw.max_amount,
      totalRaisedAmount: raw.total_raised_amount,
      netRaisedAmount: raw.net_raised_amount,
      escrowBalance: raw.escrow_balance,
      referralFeeBps: raw.referral_fee_basis_points,
      creatorFeeBps: raw.creator_fee_basis_points,
      allowFeeAvoidance: raw.allow_fee_avoidance,
      status: "active",
    });

    const mapDonation = (
      raw: DonationExternal,
    ): CampaignDonationType => ({
      onChainId: raw.id,
      campaignOnChainId: raw.campaign_id,
      donorId: raw.donor_id,
      referrerId: raw.referrer_id,
      tokenAccountId: raw.ft_id,
      totalAmount: raw.total_amount,
      netAmount: raw.net_amount,
      protocolFee: raw.protocol_fee,
      referrerFee: raw.referrer_fee,
      creatorFee: raw.creator_fee,
      message: raw.message,
      donatedAt: toIso(raw.donated_at_ms)!,
      returnedAt: toIso(raw.returned_at_ms),
      escrowed: raw.is_in_escrow,
      txHash: null,
    });

    const backfillOnce = () =>
      Effect.gen(function* () {
        const sync = yield* store.getSyncState();
        const startIndex = sync.lastCampaignIndex ?? 0;
        const pageSize = 100;

        let fromIndex = startIndex;
        let processed = 0;

        yield* store.setSyncState({
          status: "running",
          errorMessage: null,
        });

        while (true) {
          const raws = yield* contractClient.fetchCampaignsPage({
            fromIndex,
            limit: pageSize,
          });

          if (raws.length === 0) break;

          for (const raw of raws) {
            const c = mapCampaign(raw);
            yield* store.upsertCampaign(c);
          }

          processed += raws.length;
          fromIndex += raws.length;

          if (raws.length < pageSize) break;
        }

        yield* store.setSyncState({
          status: "idle",
          lastSuccessAt: new Date(),
          lastCampaignIndex: fromIndex,
        });

        console.log(
          `[CampaignIndexer] backfill complete, processed=${processed}`,
        );
      }).pipe(
        Effect.catchAll((e) =>
          store
            .setSyncState({
              status: "error",
              lastErrorAt: new Date(),
              errorMessage: e instanceof Error ? e.message : String(e),
            })
            .pipe(
              Effect.zipRight(
                Effect.fail(
                  new Error(
                    `backfillOnce failed: ${String(e)}`,
                  ),
                ),
              ),
            ),
        ),
      );

    const syncCampaignById = (id: number) =>
      Effect.gen(function* () {
        const raw = yield* contractClient.fetchCampaignById(id);
        const c = mapCampaign(raw);
        yield* store.upsertCampaign(c);
      });

    const syncDonationsForCampaign = (id: number) =>
      Effect.gen(function* () {
        const pageSize = 100;
        let fromIndex = 0;

        while (true) {
          const raws =
            yield* contractClient.fetchDonationsForCampaign({
              campaignId: id,
              fromIndex,
              limit: pageSize,
            });

          if (raws.length === 0) break;

          for (const raw of raws) {
            yield* store.upsertDonation(
              mapDonation(raw),
            );
          }

          fromIndex += raws.length;
          if (raws.length < pageSize) break;
        }
      });

    const startBackgroundIndexing = () =>
      Effect.gen(function* () {
        yield* Effect.forkDaemon(backfillOnce());
      });

    return {
      backfillOnce,
      syncCampaignById,
      syncDonationsForCampaign,
      startBackgroundIndexing,
    };
  }),
);
