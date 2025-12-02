import { Context, Effect, Layer } from "every-plugin/effect";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database as DrizzleDatabase } from "../db";
import * as schema from "../db/schema";
import type {
  CampaignType,
  CampaignDonationType,
} from "../contract";

export class Database extends Context.Tag("Database")<
  Database,
  DrizzleDatabase
>() {}

export const DatabaseLive = (url: string, authToken?: string) =>
  Layer.sync(Database, () => {
    const { createDatabase } = require("../db") as typeof import("../db");
    return createDatabase(url, authToken);
  });

export class CampaignStore extends Context.Tag("CampaignStore")<
  CampaignStore,
  {
    upsertCampaign: (
      c: CampaignType,
    ) => Effect.Effect<void, Error>;
    listCampaigns: (
      input: {
        cursor?: string;
        limit: number;
        ownerId?: string;
        recipientId?: string;
        tokenAccountId?: string;
      },
    ) => Effect.Effect<
      { items: CampaignType[]; nextCursor: string | null },
      Error
    >;
    getCampaignByOnChainId: (
      id: number,
    ) => Effect.Effect<CampaignType | null, Error>;
    upsertDonation: (
      d: CampaignDonationType,
    ) => Effect.Effect<void, Error>;
    listDonations: (
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
    getSyncState: () => Effect.Effect<
      {
        status: "idle" | "running" | "error";
        lastSuccessAt: number | null;
        lastErrorAt: number | null;
        errorMessage: string | null;
        lastCampaignIndex: number | null;
      },
      Error
    >;
    setSyncState: (
      partial: Partial<{
        status: "idle" | "running" | "error";
        lastSuccessAt: Date | null;
        lastErrorAt: Date | null;
        errorMessage: string | null;
        lastCampaignIndex: number | null;
      }>,
    ) => Effect.Effect<void, Error>;
  }
>() {}

export const CampaignStoreLive = Layer.effect(
  CampaignStore,
  Effect.gen(function* () {
    const db = yield* Database;

    const mapRowToCampaign = (
      r: typeof schema.campaigns.$inferSelect,
    ): CampaignType => ({
      onChainId: r.onChainId,
      name: r.name,
      description: r.description ?? null,
      coverImageUrl: r.coverImageUrl ?? null,
      ownerId: r.ownerId,
      recipientId: r.recipientId,
      tokenAccountId: r.tokenAccountId ?? null,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt ? r.endAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      targetAmount: r.targetAmount,
      minAmount: r.minAmount ?? null,
      maxAmount: r.maxAmount ?? null,
      totalRaisedAmount: r.totalRaisedAmount,
      netRaisedAmount: r.netRaisedAmount,
      escrowBalance: r.escrowBalance,
      referralFeeBps: r.referralFeeBps,
      creatorFeeBps: r.creatorFeeBps,
      allowFeeAvoidance: r.allowFeeAvoidance,
      status: "active",
    });

    const mapRowToDonation = (
      r: typeof schema.campaignDonations.$inferSelect,
    ): CampaignDonationType => ({
      onChainId: r.onChainId,
      campaignOnChainId: r.campaignOnChainId,
      donorId: r.donorId,
      referrerId: r.referrerId ?? null,
      tokenAccountId: r.tokenAccountId ?? null,
      totalAmount: r.totalAmount,
      netAmount: r.netAmount,
      protocolFee: r.protocolFee,
      referrerFee: r.referrerFee ?? null,
      creatorFee: r.creatorFee ?? null,
      message: r.message ?? null,
      donatedAt: r.donatedAt.toISOString(),
      returnedAt: r.returnedAt
        ? r.returnedAt.toISOString()
        : null,
      escrowed: r.escrowed,
      txHash: r.txHash ?? null,
    });

    return {
      upsertCampaign: (c) =>
        Effect.tryPromise({
          try: async () => {
            await db
              .insert(schema.campaigns)
              .values({
                onChainId: c.onChainId,
                name: c.name,
                description: c.description ?? null,
                coverImageUrl: c.coverImageUrl ?? null,
                ownerId: c.ownerId,
                recipientId: c.recipientId,
                tokenAccountId: c.tokenAccountId ?? null,
                startAt: new Date(c.startAt),
                endAt: c.endAt ? new Date(c.endAt) : null,
                createdAt: new Date(c.createdAt),
                targetAmount: c.targetAmount,
                minAmount: c.minAmount ?? null,
                maxAmount: c.maxAmount ?? null,
                totalRaisedAmount: c.totalRaisedAmount,
                netRaisedAmount: c.netRaisedAmount,
                escrowBalance: c.escrowBalance,
                referralFeeBps: c.referralFeeBps,
                creatorFeeBps: c.creatorFeeBps,
                allowFeeAvoidance: c.allowFeeAvoidance,
              })
              .onConflictDoUpdate({
                target: schema.campaigns.onChainId,
                set: {
                  name: c.name,
                  description: c.description ?? null,
                  coverImageUrl: c.coverImageUrl ?? null,
                  ownerId: c.ownerId,
                  recipientId: c.recipientId,
                  tokenAccountId: c.tokenAccountId ?? null,
                  startAt: new Date(c.startAt),
                  endAt: c.endAt ? new Date(c.endAt) : null,
                  createdAt: new Date(c.createdAt),
                  targetAmount: c.targetAmount,
                  minAmount: c.minAmount ?? null,
                  maxAmount: c.maxAmount ?? null,
                  totalRaisedAmount: c.totalRaisedAmount,
                  netRaisedAmount: c.netRaisedAmount,
                  escrowBalance: c.escrowBalance,
                  referralFeeBps: c.referralFeeBps,
                  creatorFeeBps: c.creatorFeeBps,
                  allowFeeAvoidance: c.allowFeeAvoidance,
                },
              });
          },
          catch: (e) => new Error(`upsertCampaign failed: ${e}`),
        }),

      listCampaigns: (input) =>
        Effect.tryPromise({
          try: async () => {
            const cursorId = input.cursor
              ? Number(input.cursor)
              : undefined;

            const conds = [];
            if (cursorId !== undefined) {
              conds.push(
                gt(schema.campaigns.onChainId, cursorId),
              );
            }
            if (input.ownerId) {
              conds.push(
                eq(schema.campaigns.ownerId, input.ownerId),
              );
            }
            if (input.recipientId) {
              conds.push(
                eq(
                  schema.campaigns.recipientId,
                  input.recipientId,
                ),
              );
            }
            if (input.tokenAccountId) {
              conds.push(
                eq(
                  schema.campaigns.tokenAccountId,
                  input.tokenAccountId,
                ),
              );
            }

            const where =
              conds.length > 0 ? and(...conds) : undefined;

            const rows = await db
              .select()
              .from(schema.campaigns)
              .where(where as any)
              .orderBy(schema.campaigns.onChainId)
              .limit(input.limit + 1);

            const items = rows
              .slice(0, input.limit)
              .map(mapRowToCampaign);

            const nextCursor =
              rows.length > input.limit
                ? String(rows[input.limit]!.onChainId)
                : null;

            return { items, nextCursor };
          },
          catch: (e) => new Error(`listCampaigns failed: ${e}`),
        }),

      getCampaignByOnChainId: (id) =>
        Effect.tryPromise({
          try: async () => {
            const rows = await db
              .select()
              .from(schema.campaigns)
              .where(eq(schema.campaigns.onChainId, id))
              .limit(1);
            if (!rows[0]) return null;
            return mapRowToCampaign(rows[0]!);
          },
          catch: (e) => new Error(`getCampaign failed: ${e}`),
        }),

      upsertDonation: (d) =>
        Effect.tryPromise({
          try: async () => {
            await db
              .insert(schema.campaignDonations)
              .values({
                onChainId: d.onChainId,
                campaignOnChainId: d.campaignOnChainId,
                donorId: d.donorId,
                referrerId: d.referrerId ?? null,
                tokenAccountId: d.tokenAccountId ?? null,
                totalAmount: d.totalAmount,
                netAmount: d.netAmount,
                protocolFee: d.protocolFee,
                referrerFee: d.referrerFee ?? null,
                creatorFee: d.creatorFee ?? null,
                message: d.message ?? null,
                donatedAt: new Date(d.donatedAt),
                returnedAt: d.returnedAt
                  ? new Date(d.returnedAt)
                  : null,
                escrowed: d.escrowed,
                txHash: d.txHash ?? null,
              })
              .onConflictDoUpdate({
                target: [
                  schema.campaignDonations.onChainId,
                  schema.campaignDonations.campaignOnChainId,
                ],
                set: {
                  returnedAt: d.returnedAt
                    ? new Date(d.returnedAt)
                    : null,
                  escrowed: d.escrowed,
                  txHash: d.txHash ?? null,
                },
              });
          },
          catch: (e) => new Error(`upsertDonation failed: ${e}`),
        }),

      listDonations: (filters) =>
        Effect.tryPromise({
          try: async () => {
            const cursorId = filters.cursor
              ? Number(filters.cursor)
              : undefined;

            const conds = [];
            if (cursorId !== undefined) {
              conds.push(
                gt(schema.campaignDonations.id, cursorId),
              );
            }
            if (filters.id !== undefined) {
              conds.push(
                eq(
                  schema.campaignDonations.campaignOnChainId,
                  filters.id,
                ),
              );
            }
            if (filters.donorId) {
              conds.push(
                eq(
                  schema.campaignDonations.donorId,
                  filters.donorId,
                ),
              );
            }
            if (filters.excludeRefunded) {
              conds.push(
                isNull(schema.campaignDonations.returnedAt),
              );
            }

            const where =
              conds.length > 0 ? and(...conds) : undefined;

            const rows = await db
              .select()
              .from(schema.campaignDonations)
              .where(where as any)
              .orderBy(schema.campaignDonations.id)
              .limit(filters.limit + 1);

            const items = rows
              .slice(0, filters.limit)
              .map(mapRowToDonation);

            const nextCursor =
              rows.length > filters.limit
                ? String(rows[filters.limit]!.id)
                : null;

            return { items, nextCursor };
          },
          catch: (e) => new Error(`listDonations failed: ${e}`),
        }),

      getSyncState: () =>
        Effect.tryPromise({
          try: async () => {
            const rows = await db
              .select()
              .from(schema.syncState)
              .where(eq(schema.syncState.id, "campaigns"))
              .limit(1);
            if (!rows[0]) {
              return {
                status: "idle" as const,
                lastSuccessAt: null,
                lastErrorAt: null,
                errorMessage: null,
                lastCampaignIndex: null,
              };
            }
            const r = rows[0]!;
            return {
              status: r.status as
                | "idle"
                | "running"
                | "error",
              lastSuccessAt: r.lastSuccessAt
                ? Math.floor(
                    r.lastSuccessAt.getTime() / 1000,
                  )
                : null,
              lastErrorAt: r.lastErrorAt
                ? Math.floor(
                    r.lastErrorAt.getTime() / 1000,
                  )
                : null,
              errorMessage: r.errorMessage ?? null,
              lastCampaignIndex: r.lastCampaignIndex ?? null,
            };
          },
          catch: (e) => new Error(`getSyncState failed: ${e}`),
        }),

      setSyncState: (partial) =>
        Effect.tryPromise({
          try: async () => {
            await db
              .insert(schema.syncState)
              .values({
                id: "campaigns",
                status: partial.status ?? "idle",
                lastSuccessAt:
                  partial.lastSuccessAt ?? null,
                lastErrorAt: partial.lastErrorAt ?? null,
                errorMessage: partial.errorMessage ?? null,
                lastCampaignIndex:
                  partial.lastCampaignIndex ?? null,
              })
              .onConflictDoUpdate({
                target: schema.syncState.id,
                set: {
                  status: partial.status ?? "idle",
                  lastSuccessAt:
                    partial.lastSuccessAt ?? null,
                  lastErrorAt:
                    partial.lastErrorAt ?? null,
                  errorMessage:
                    partial.errorMessage ?? null,
                  lastCampaignIndex:
                    partial.lastCampaignIndex ?? null,
                },
              });
          },
          catch: (e) => new Error(`setSyncState failed: ${e}`),
        }),
    };
  }),
);
