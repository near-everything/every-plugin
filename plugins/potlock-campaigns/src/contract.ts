import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { CommonPluginErrors } from "every-plugin";

const AccountId = z
  .string()
  .min(2)
  .describe("NEAR account ID (e.g. alice.near)");

const Timestamp = z
  .string()
  .datetime()
  .describe("ISO8601 timestamp");

const YoctoString = z
  .string()
  .regex(/^\d+$/, "Must be a decimal string")
  .describe("Amount in smallest unit (yocto)");

const CampaignStatus = z.enum([
  "upcoming",
  "active",
  "ended",
  "unfulfilled",
]);

export const Campaign = z.object({
  onChainId: z.number().int().nonnegative(),
  name: z.string(),
  description: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  ownerId: AccountId,
  recipientId: AccountId,
  tokenAccountId: z.string().nullable(),
  startAt: Timestamp,
  endAt: Timestamp.nullable(),
  createdAt: Timestamp,
  targetAmount: YoctoString,
  minAmount: YoctoString.nullable(),
  maxAmount: YoctoString.nullable(),
  totalRaisedAmount: YoctoString,
  netRaisedAmount: YoctoString,
  escrowBalance: YoctoString,
  referralFeeBps: z.number().int().nonnegative(),
  creatorFeeBps: z.number().int().nonnegative(),
  allowFeeAvoidance: z.boolean(),
  status: CampaignStatus,
});

export const CampaignDonation = z.object({
  onChainId: z.number().int().nonnegative(),
  campaignOnChainId: z.number().int().nonnegative(),
  donorId: AccountId,
  referrerId: AccountId.nullable(),
  tokenAccountId: z.string().nullable(),
  totalAmount: YoctoString,
  netAmount: YoctoString,
  protocolFee: YoctoString,
  referrerFee: YoctoString.nullable(),
  creatorFee: YoctoString.nullable(),
  message: z.string().nullable(),
  donatedAt: Timestamp,
  returnedAt: Timestamp.nullable(),
  escrowed: z.boolean(),
  txHash: z.string().nullable(),
});

export const ListCampaignsInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  ownerId: AccountId.optional(),
  recipientId: AccountId.optional(),
  tokenAccountId: z.string().optional(),
  status: CampaignStatus.optional(),
});

export const PaginatedCampaigns = z.object({
  items: z.array(Campaign),
  nextCursor: z.string().nullable(),
});

export const ListCampaignDonationsInput = z.object({
  id: z.number().int().nonnegative(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  donorId: AccountId.optional(),
  excludeRefunded: z.boolean().default(false),
});

export const PaginatedDonations = z.object({
  items: z.array(CampaignDonation),
  nextCursor: z.string().nullable(),
});

export const SyncStatus = z.object({
  status: z.enum(["idle", "running", "error"]),
  lastSuccessAt: z.number().nullable(),
  lastErrorAt: z.number().nullable(),
  errorMessage: z.string().nullable(),
});

export const CreateCampaignInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional(),
  recipientId: AccountId,
  ftAccountId: z.string().optional(),
  targetAmount: YoctoString,
  minAmount: YoctoString.optional(),
  maxAmount: YoctoString.optional(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative().optional(),
  referralFeeBps: z.number().int().nonnegative(),
  creatorFeeBps: z.number().int().nonnegative(),
  allowFeeAvoidance: z.boolean().default(false),
  storageDeposit: z
    .string()
    .default("0.25 NEAR")
    .describe("Deposit for campaign storage"),
});

export const TransactionRequest = z.object({
  contractId: z.string().describe("Target contract account ID"),
  methodName: z.string().describe("Contract method to call"),
  args: z.record(z.string(), z.unknown()).describe("Method arguments as JSON object"),
  deposit: z.string().describe("Attached deposit in yoctoNEAR"),
  gas: z.string().describe("Gas to attach"),
});

export const CreateCampaignResult = z.object({
  transactionHash: z.string(),
  campaignOnChainId: z.number().optional(),
});

export const contract = oc.router({
  listCampaigns: oc
    .route({
      method: "POST",
      path: "/campaigns/list",
      summary: "List campaigns",
    })
    .input(ListCampaignsInput)
    .output(PaginatedCampaigns)
    .errors(CommonPluginErrors),

  getCampaign: oc
    .route({
      method: "GET",
      path: "/campaigns/{id}",
      summary: "Get single campaign",
    })
    .input(
      z.object({
        id: z.number().int().nonnegative(),
      }),
    )
    .output(Campaign.nullable())
    .errors(CommonPluginErrors),

  listCampaignDonations: oc
    .route({
      method: "POST",
      path: "/campaigns/{id}/donations",
      summary: "List donations for a campaign",
    })
    .input(ListCampaignDonationsInput)
    .output(PaginatedDonations)
    .errors(CommonPluginErrors),

  listAllDonations: oc
    .route({
      method: "POST",
      path: "/donations/list",
      summary: "List all donations",
    })
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        donorId: AccountId.optional(),
        campaignOnChainId: z.number().int().optional(),
        excludeRefunded: z.boolean().default(false),
      }),
    )
    .output(PaginatedDonations)
    .errors(CommonPluginErrors),

  sync: oc
    .route({
      method: "POST",
      path: "/sync",
      summary: "Trigger backfill / sync",
    })
    .input(
      z.object({
        full: z
          .boolean()
          .default(false)
          .describe("Force full re-sync from scratch"),
      }),
    )
    .output(z.object({ status: z.string() }))
    .errors(CommonPluginErrors),

  getSyncStatus: oc
    .route({
      method: "GET",
      path: "/sync-status",
      summary: "Get sync status",
    })
    .output(SyncStatus)
    .errors(CommonPluginErrors),

  getContractConfig: oc
    .route({
      method: "GET",
      path: "/contract-config",
      summary: "Get campaign contract config",
    })
    .output(z.record(z.string(), z.unknown()))
    .errors(CommonPluginErrors),

  ping: oc
    .route({
      method: "GET",
      path: "/ping",
      summary: "Healthcheck",
    })
    .output(
      z.object({
        status: z.literal("ok"),
        timestamp: z.string(),
      }),
    ),

  prepareCreateCampaign: oc
    .route({
      method: "POST",
      path: "/campaigns/prepare-create",
      summary: "Prepare transaction data for creating a campaign",
    })
    .input(CreateCampaignInput)
    .output(TransactionRequest)
    .errors(CommonPluginErrors),

  createCampaign: oc
    .route({
      method: "POST",
      path: "/campaigns/create",
      summary: "Relay a signed create_campaign transaction",
    })
    .input(z.object({
      signedPayload: z.string().describe("Base64 encoded SignedDelegateAction"),
    }))
    .output(CreateCampaignResult)
    .errors(CommonPluginErrors),
});

export type CampaignType = z.infer<typeof Campaign>;
export type CampaignDonationType = z.infer<typeof CampaignDonation>;
