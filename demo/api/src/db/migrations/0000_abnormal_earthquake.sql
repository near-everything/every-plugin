CREATE TABLE `key_value_store` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`near_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
