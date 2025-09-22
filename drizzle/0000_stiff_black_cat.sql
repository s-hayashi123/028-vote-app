CREATE TABLE `Poll` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `PollOption` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`votes` integer DEFAULT 0 NOT NULL,
	`pollId` text NOT NULL
);
