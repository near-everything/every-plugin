CREATE TABLE `chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`chat_type` text NOT NULL,
	`title` text,
	`username` text,
	`description` text,
	`member_count` integer,
	`is_active` integer DEFAULT true,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_message_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_chat_id_unique` ON `chats` (`chat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `chats_chat_id_idx` ON `chats` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chats_username_idx` ON `chats` (`username`);--> statement-breakpoint
CREATE INDEX `chats_type_idx` ON `chats` (`chat_type`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`platform` text DEFAULT 'telegram' NOT NULL,
	`content` text NOT NULL,
	`content_type` text,
	`chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`chat_type` text,
	`chat_title` text,
	`chat_username` text,
	`original_author_id` text,
	`original_author_username` text,
	`original_author_display_name` text,
	`is_command` integer DEFAULT false,
	`is_mentioned` integer DEFAULT false,
	`reply_to_message_id` integer,
	`forward_from_user_id` text,
	`created_at` text,
	`ingested_at` text DEFAULT CURRENT_TIMESTAMP,
	`url` text,
	`raw_data` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_external_id_idx` ON `items` (`external_id`);--> statement-breakpoint
CREATE INDEX `items_chat_id_idx` ON `items` (`chat_id`);--> statement-breakpoint
CREATE INDEX `items_author_username_idx` ON `items` (`original_author_username`);--> statement-breakpoint
CREATE INDEX `items_ingested_at_idx` ON `items` (`ingested_at`);--> statement-breakpoint
CREATE INDEX `items_chat_type_idx` ON `items` (`chat_type`);--> statement-breakpoint
CREATE INDEX `items_command_idx` ON `items` (`is_command`);--> statement-breakpoint
CREATE INDEX `items_mention_idx` ON `items` (`is_mentioned`);--> statement-breakpoint
CREATE TABLE `processing_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`submission_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0,
	`worker_id` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `queue_status_idx` ON `processing_queue` (`status`);--> statement-breakpoint
CREATE INDEX `queue_worker_idx` ON `processing_queue` (`worker_id`);--> statement-breakpoint
CREATE TABLE `stream_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase` text NOT NULL,
	`last_update_id` integer,
	`total_processed` integer DEFAULT 0,
	`next_poll_ms` integer,
	`chat_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_name` text,
	`display_name` text,
	`language_code` text,
	`is_bot` integer DEFAULT false,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_message_at` text,
	`message_count` integer DEFAULT 0,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_user_id_unique` ON `users` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_user_id_idx` ON `users` (`user_id`);--> statement-breakpoint
CREATE INDEX `users_username_idx` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_bot_idx` ON `users` (`is_bot`);