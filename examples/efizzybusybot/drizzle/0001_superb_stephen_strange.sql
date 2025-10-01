ALTER TABLE `messages` ADD `embedding` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `conversation_thread_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `responded_to` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `messages` ADD `command_type` text;--> statement-breakpoint
CREATE INDEX `messages_conversation_thread_idx` ON `messages` (`conversation_thread_id`);--> statement-breakpoint
CREATE INDEX `messages_responded_to_idx` ON `messages` (`responded_to`);--> statement-breakpoint
CREATE INDEX `messages_command_type_idx` ON `messages` (`command_type`);