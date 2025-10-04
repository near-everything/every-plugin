CREATE TABLE `entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`near_account` text,
	`entity_type` text NOT NULL,
	`description` text,
	`website` text,
	`confidence_score` real DEFAULT 0.5,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_near_account_unique` ON `entities` (`near_account`);--> statement-breakpoint
CREATE INDEX `entities_name_idx` ON `entities` (`name`);--> statement-breakpoint
CREATE INDEX `entities_near_account_idx` ON `entities` (`near_account`);--> statement-breakpoint
CREATE INDEX `entities_entity_type_idx` ON `entities` (`entity_type`);--> statement-breakpoint
CREATE TABLE `personas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`display_name` text NOT NULL,
	`near_account` text,
	`persona_type` text NOT NULL,
	`bio` text,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP,
	`last_active_at` text DEFAULT CURRENT_TIMESTAMP,
	`confidence_score` real DEFAULT 0.5
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personas_near_account_unique` ON `personas` (`near_account`);--> statement-breakpoint
CREATE INDEX `personas_near_account_idx` ON `personas` (`near_account`);--> statement-breakpoint
CREATE INDEX `personas_persona_type_idx` ON `personas` (`persona_type`);--> statement-breakpoint
CREATE INDEX `personas_display_name_idx` ON `personas` (`display_name`);--> statement-breakpoint
CREATE TABLE `platform_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`persona_id` integer,
	`plugin_id` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`platform_username` text,
	`platform_display_name` text,
	`verified` integer DEFAULT false,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_accounts_unique` ON `platform_accounts` (`plugin_id`,`platform_user_id`);--> statement-breakpoint
CREATE INDEX `platform_accounts_persona_id_idx` ON `platform_accounts` (`persona_id`);--> statement-breakpoint
CREATE INDEX `platform_accounts_plugin_id_idx` ON `platform_accounts` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `platform_accounts_platform_username_idx` ON `platform_accounts` (`platform_username`);--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` integer NOT NULL,
	`predicate` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` integer NOT NULL,
	`context` text,
	`confidence_score` real DEFAULT 0.5,
	`source_message_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `relationships_subject_idx` ON `relationships` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE INDEX `relationships_object_idx` ON `relationships` (`object_type`,`object_id`);--> statement-breakpoint
CREATE INDEX `relationships_predicate_idx` ON `relationships` (`predicate`);--> statement-breakpoint
CREATE INDEX `relationships_source_message_idx` ON `relationships` (`source_message_id`);--> statement-breakpoint
DROP INDEX IF EXISTS "entities_near_account_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "entities_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "entities_near_account_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "entities_entity_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_external_id_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_external_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_persona_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_platform_account_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_plugin_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_chat_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_author_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_author_username_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_ingested_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_is_command_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_processed_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_conversation_thread_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_responded_to_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "messages_command_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "personas_near_account_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "personas_near_account_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "personas_persona_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "personas_display_name_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "platform_accounts_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "platform_accounts_persona_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "platform_accounts_plugin_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "platform_accounts_platform_username_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relationships_subject_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relationships_object_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relationships_predicate_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "relationships_source_message_idx";--> statement-breakpoint
ALTER TABLE `messages` ADD `persona_id` integer REFERENCES personas(id);--> statement-breakpoint
ALTER TABLE `messages` ADD `platform_account_id` integer REFERENCES platform_accounts(id);--> statement-breakpoint
ALTER TABLE `messages` ADD `plugin_id` text NOT NULL DEFAULT '@curatedotfun/telegram';--> statement-breakpoint
ALTER TABLE `stream_state` ADD `plugin_id` text;--> statement-breakpoint
ALTER TABLE `messages` ALTER COLUMN "embedding" TO "embedding" F32_BLOB(384);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_unique` ON `messages` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_external_id_idx` ON `messages` (`external_id`);--> statement-breakpoint
CREATE INDEX `messages_persona_id_idx` ON `messages` (`persona_id`);--> statement-breakpoint
CREATE INDEX `messages_platform_account_id_idx` ON `messages` (`platform_account_id`);--> statement-breakpoint
CREATE INDEX `messages_plugin_id_idx` ON `messages` (`plugin_id`);--> statement-breakpoint
CREATE INDEX `messages_chat_id_idx` ON `messages` (`chat_id`);--> statement-breakpoint
CREATE INDEX `messages_author_id_idx` ON `messages` (`author_id`);--> statement-breakpoint
CREATE INDEX `messages_author_username_idx` ON `messages` (`author_username`);--> statement-breakpoint
CREATE INDEX `messages_ingested_at_idx` ON `messages` (`ingested_at`);--> statement-breakpoint
CREATE INDEX `messages_is_command_idx` ON `messages` (`is_command`);--> statement-breakpoint
CREATE INDEX `messages_processed_idx` ON `messages` (`processed`);--> statement-breakpoint
CREATE INDEX `messages_conversation_thread_idx` ON `messages` (`conversation_thread_id`);--> statement-breakpoint
CREATE INDEX `messages_responded_to_idx` ON `messages` (`responded_to`);--> statement-breakpoint
CREATE INDEX `messages_command_type_idx` ON `messages` (`command_type`);
