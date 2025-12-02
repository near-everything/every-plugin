import {
  sqliteTable,
  text,
  integer,
  index,
} from "drizzle-orm/sqlite-core";

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    onChainId: integer("on_chain_id").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    ownerId: text("owner_id").notNull(),
    recipientId: text("recipient_id").notNull(),
    tokenAccountId: text("token_account_id"),
    startAt: integer("start_at", { mode: "timestamp" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    targetAmount: text("target_amount").notNull(),
    minAmount: text("min_amount"),
    maxAmount: text("max_amount"),
    totalRaisedAmount: text("total_raised_amount").notNull(),
    netRaisedAmount: text("net_raised_amount").notNull(),
    escrowBalance: text("escrow_balance").notNull(),
    referralFeeBps: integer("referral_fee_bps").notNull(),
    creatorFeeBps: integer("creator_fee_bps").notNull(),
    allowFeeAvoidance: integer("allow_fee_avoidance", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
  },
  (t) => [
    index("campaigns_on_chain_id_idx").on(t.onChainId),
    index("campaigns_owner_idx").on(t.ownerId),
    index("campaigns_recipient_idx").on(t.recipientId),
    index("campaigns_token_idx").on(t.tokenAccountId),
    index("campaigns_created_idx").on(t.createdAt),
  ],
);

export const campaignDonations = sqliteTable(
  "campaign_donations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    onChainId: integer("on_chain_id").notNull(),
    campaignOnChainId: integer("campaign_on_chain_id").notNull(),
    donorId: text("donor_id").notNull(),
    referrerId: text("referrer_id"),
    tokenAccountId: text("token_account_id"),
    totalAmount: text("total_amount").notNull(),
    netAmount: text("net_amount").notNull(),
    protocolFee: text("protocol_fee").notNull(),
    referrerFee: text("referrer_fee"),
    creatorFee: text("creator_fee"),
    message: text("message"),
    donatedAt: integer("donated_at", { mode: "timestamp" }).notNull(),
    returnedAt: integer("returned_at", {
      mode: "timestamp",
    }),
    escrowed: integer("escrowed", { mode: "boolean" })
      .notNull()
      .default(false),
    txHash: text("tx_hash"),
  },
  (t) => [
    index("donations_campaign_idx").on(t.campaignOnChainId),
    index("donations_donor_idx").on(t.donorId),
  ],
);

export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  lastSuccessAt: integer("last_success_at", {
    mode: "timestamp",
  }),
  lastErrorAt: integer("last_error_at", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  lastCampaignIndex: integer("last_campaign_index"),
});
