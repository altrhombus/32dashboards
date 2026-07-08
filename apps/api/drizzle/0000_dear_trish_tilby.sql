CREATE TABLE `auction_state` (
	`event_id` text PRIMARY KEY NOT NULL,
	`total_raised` real DEFAULT 0 NOT NULL,
	`total_raised_display` text DEFAULT '$0' NOT NULL,
	`items` text NOT NULL,
	`refreshed_at` text NOT NULL,
	`source_url` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`name` text NOT NULL,
	`cause_name` text DEFAULT '' NOT NULL,
	`end_date_time` text,
	`theme` text NOT NULL,
	`announcements` text NOT NULL,
	`ask_me` text NOT NULL,
	`scraper_source` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_only_one_active` ON `events` (`is_active`) WHERE "events"."is_active" = 1;--> statement-breakpoint
CREATE TABLE `incentives` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`target` real NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`display_now` integer DEFAULT false NOT NULL,
	`display_until_met` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
