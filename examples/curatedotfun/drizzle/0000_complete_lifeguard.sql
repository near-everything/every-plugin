CREATE TABLE IF NOT EXISTS `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`platform` text NOT NULL CHECK (platform IN ('twitter', 'tiktok', 'reddit')),
	`content` text NOT NULL,
	`content_type` text,
	`conversation_id` text,
	`original_author_username` text,
	`original_author_id` text,
	`curator_username` text,
	`created_at` text,
	`ingested_at` text DEFAULT CURRENT_TIMESTAMP,
	`url` text,
	`raw_data` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `external_id_idx` ON `items` (`external_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `conversation_idx` ON `items` (`conversation_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `curator_idx` ON `items` (`curator_username`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ingested_at_idx` ON `items` (`ingested_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `processing_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`submission_type` text NOT NULL CHECK (submission_type IN ('submit')),
	`status` text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
	`attempts` integer DEFAULT 0,
	`worker_id` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `status_idx` ON `processing_queue` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `worker_idx` ON `processing_queue` (`worker_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stream_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase` text NOT NULL CHECK (phase IN ('initial', 'backfill', 'live')),
	`most_recent_id` text,
	`oldest_seen_id` text,
	`backfill_done` integer DEFAULT 0,
	`total_processed` integer DEFAULT 0,
	`next_poll_ms` integer,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
