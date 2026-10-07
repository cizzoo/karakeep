CREATE TABLE `bookmarkTranslations` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`targetLanguage` text DEFAULT 'en' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`phase` text,
	`progressDone` integer DEFAULT 0 NOT NULL,
	`progressTotal` integer DEFAULT 0 NOT NULL,
	`failedUnits` integer DEFAULT 0 NOT NULL,
	`model` text NOT NULL,
	`promptVersion` integer NOT NULL,
	`error` text,
	`sourceHash` text,
	`translatedHtml` text,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkTranslations_userId_idx` ON `bookmarkTranslations` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkTranslations_bookmarkId_targetLanguage_unique` ON `bookmarkTranslations` (`bookmarkId`,`targetLanguage`);--> statement-breakpoint
DROP TABLE `archiveTranslations`;--> statement-breakpoint
DROP TABLE `pageAnnotations`;