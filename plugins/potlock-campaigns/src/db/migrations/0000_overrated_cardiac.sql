CREATE TABLE `campaign_donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`on_chain_id` integer NOT NULL,
	`campaign_on_chain_id` integer NOT NULL,
	`donor_id` text NOT NULL,
	`referrer_id` text,
	`token_account_id` text,
	`total_amount` text NOT NULL,
	`net_amount` text NOT NULL,
	`protocol_fee` text NOT NULL,
	`referrer_fee` text,
	`creator_fee` text,
	`message` text,
	`donated_at` integer NOT NULL,
	`returned_at` integer,
	`escrowed` integer DEFAULT false NOT NULL,
	`tx_hash` text
);
--> statement-breakpoint
CREATE INDEX `donations_campaign_idx` ON `campaign_donations` (`campaign_on_chain_id`);--> statement-breakpoint
CREATE INDEX `donations_donor_idx` ON `campaign_donations` (`donor_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`on_chain_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`cover_image_url` text,
	`owner_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`token_account_id` text,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`created_at` integer NOT NULL,
	`target_amount` text NOT NULL,
	`min_amount` text,
	`max_amount` text,
	`total_raised_amount` text NOT NULL,
	`net_raised_amount` text NOT NULL,
	`escrow_balance` text NOT NULL,
	`referral_fee_bps` integer NOT NULL,
	`creator_fee_bps` integer NOT NULL,
	`allow_fee_avoidance` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_on_chain_id_unique` ON `campaigns` (`on_chain_id`);--> statement-breakpoint
CREATE INDEX `campaigns_on_chain_id_idx` ON `campaigns` (`on_chain_id`);--> statement-breakpoint
CREATE INDEX `campaigns_owner_idx` ON `campaigns` (`owner_id`);--> statement-breakpoint
CREATE INDEX `campaigns_recipient_idx` ON `campaigns` (`recipient_id`);--> statement-breakpoint
CREATE INDEX `campaigns_token_idx` ON `campaigns` (`token_account_id`);--> statement-breakpoint
CREATE INDEX `campaigns_created_idx` ON `campaigns` (`created_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`last_success_at` integer,
	`last_error_at` integer,
	`error_message` text,
	`last_campaign_index` integer
);
