import { z } from "every-plugin/zod";

const AccountId = z
  .string()
  .min(2)
  .describe("NEAR Account ID (AccountId from ABI)");

const Uint64 = z
  .number()
  .int()
  .nonnegative()
  .describe("uint64 serialized as JSON number");

const Uint32 = z
  .number()
  .int()
  .nonnegative()
  .describe("uint32 serialized as JSON number");

export const CampaignExternalSchema = z.object({
  allow_fee_avoidance: z.boolean(),
  cover_image_url: z.string().nullable(),
  created_ms: Uint64,
  creator_fee_basis_points: Uint32,
  description: z.string().nullable(),
  end_ms: Uint64.nullable(),
  escrow_balance: z.string(),
  ft_id: AccountId.nullable(),
  id: Uint64,
  max_amount: z.string().nullable(),
  min_amount: z.string().nullable(),
  name: z.string(),
  net_raised_amount: z.string(),
  owner: AccountId,
  recipient: AccountId,
  referral_fee_basis_points: Uint32,
  start_ms: Uint64,
  target_amount: z.string(),
  total_raised_amount: z.string(),
});

export type CampaignExternal = z.infer<typeof CampaignExternalSchema>;

export const DonationExternalSchema = z.object({
  campaign_id: Uint64,
  creator_fee: z.string(),
  donated_at_ms: Uint64,
  donor_id: AccountId,
  ft_id: AccountId.nullable(),
  id: Uint64,
  is_in_escrow: z.boolean(),
  message: z.string().nullable(),
  net_amount: z.string(),
  protocol_fee: z.string(),
  recipient_id: AccountId,
  referrer_fee: z.string().nullable(),
  referrer_id: AccountId.nullable(),
  returned_at_ms: Uint64.nullable(),
  total_amount: z.string(),
});

export type DonationExternal = z.infer<typeof DonationExternalSchema>;

export const ConfigSchema = z.object({
  admins: z.array(AccountId),
  default_creator_fee_basis_points: Uint32,
  default_referral_fee_basis_points: Uint32,
  owner: AccountId,
  protocol_fee_basis_points: Uint32,
  protocol_fee_recipient_account: AccountId,
  total_campaigns_count: Uint32,
  total_donations_count: Uint32,
});

export type ConfigExternal = z.infer<typeof ConfigSchema>;
