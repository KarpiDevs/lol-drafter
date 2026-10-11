CREATE TABLE `champions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`image` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comp_alternatives` (
	`comp_id` integer NOT NULL,
	`role` text NOT NULL,
	`champion_id` text NOT NULL,
	`priority` integer NOT NULL,
	PRIMARY KEY(`comp_id`, `role`, `champion_id`),
	FOREIGN KEY (`comp_id`) REFERENCES `comps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comp_slots` (
	`comp_id` integer NOT NULL,
	`role` text NOT NULL,
	`player_id` integer,
	`champion_id` text,
	PRIMARY KEY(`comp_id`, `role`),
	FOREIGN KEY (`comp_id`) REFERENCES `comps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`style` text DEFAULT 'otro' NOT NULL,
	`game_plan` text,
	`key_point` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`side` text NOT NULL,
	`own_team_id` integer NOT NULL,
	`rival_team_id` integer,
	`own_lineup_json` text NOT NULL,
	`rival_lineup_json` text,
	`actions_json` text NOT NULL,
	`result` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`own_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rival_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `player_champions` (
	`player_id` integer NOT NULL,
	`champion_id` text NOT NULL,
	`tier` text NOT NULL,
	`priority` integer NOT NULL,
	`notes` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	PRIMARY KEY(`player_id`, `champion_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`champion_id`) REFERENCES `champions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`aliases` text,
	`riot_id` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_team_name_uq` ON `players` (`team_id`,`name`);--> statement-breakpoint
CREATE TABLE `pool_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`faculty` text,
	`is_own` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);