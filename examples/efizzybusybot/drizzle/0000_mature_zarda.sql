CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`content` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` text NOT NULL,
	`url` text,
	`author_id` text,
	`author_username` text,
	`author_display_name` text,
	`chat_id` text NOT NULL,
	`message_id` integer NOT NULL,
	`chat_type` text NOT NULL,
	`is_command` integer DEFAULT false,
	`is_reply` integer DEFAULT false,
	`has_media` integer DEFAULT false,
	`ingested_at` text DEFAULT CURRENT_TIMESTAMP,
	`processed` integer DEFAULT false,
	`embedding` F32_BLOB(384),
	`conversation_thread_id` text,
	`responded_to` integer DEFAULT false,
	`command_type` text,
	`raw_data` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_unique` ON `messages` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_idx` ON `messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `messages_chat_id_idx` ON `messages` (`chat_id`);--> statement-breakpoint
CREATE INDEX `messages_author_id_idx` ON `messages` (`author_id`);--> statement-breakpoint
CREATE INDEX `messages_author_username_idx` ON `messages` (`author_username`);--> statement-breakpoint
CREATE INDEX `messages_ingested_at_idx` ON `messages` (`ingested_at`);--> statement-breakpoint
CREATE INDEX `messages_is_command_idx` ON `messages` (`is_command`);--> statement-breakpoint
CREATE INDEX `messages_processed_idx` ON `messages` (`processed`);--> statement-breakpoint
CREATE INDEX `messages_conversation_thread_idx` ON `messages` (`conversation_thread_id`);--> statement-breakpoint
CREATE INDEX `messages_responded_to_idx` ON `messages` (`responded_to`);--> statement-breakpoint
CREATE INDEX `messages_command_type_idx` ON `messages` (`command_type`);--> statement-breakpoint
CREATE TABLE `stream_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`last_update_id` integer,
	`total_processed` integer DEFAULT 0,
	`chat_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS embedding_index
ON messages (
     libsql_vector_idx(embedding, 'metric=cosine')
)
