CREATE TABLE `archiveTranslations` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`targetLanguage` text DEFAULT 'en' NOT NULL,
	`originalAssetId` text NOT NULL,
	`translatedAssetId` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`phase` text,
	`progressDone` integer DEFAULT 0 NOT NULL,
	`progressTotal` integer DEFAULT 0 NOT NULL,
	`failedUnits` integer DEFAULT 0 NOT NULL,
	`model` text NOT NULL,
	`promptVersion` integer NOT NULL,
	`error` text,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `archiveTranslations_userId_idx` ON `archiveTranslations` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `archiveTranslations_bookmarkId_targetLanguage_unique` ON `archiveTranslations` (`bookmarkId`,`targetLanguage`);
