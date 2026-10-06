CREATE TABLE `pageAnnotations` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`assetId` text,
	`exact` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`startOffset` integer NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`comment` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pageAnnotations_bookmarkId_idx` ON `pageAnnotations` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `pageAnnotations_userId_idx` ON `pageAnnotations` (`userId`);
