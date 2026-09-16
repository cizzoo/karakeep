CREATE TABLE `todoItems` (
	`id` text PRIMARY KEY NOT NULL,
	`todoListId` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`position` real NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`todoListId`) REFERENCES `todoLists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todoItems_todoListId_idx` ON `todoItems` (`todoListId`);--> statement-breakpoint
CREATE TABLE `todoLists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '📋' NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todoLists_userId_idx` ON `todoLists` (`userId`);