CREATE TABLE `bookmarksInTodoLists` (
	`bookmarkId` text NOT NULL,
	`todoListId` text NOT NULL,
	`addedAt` integer,
	PRIMARY KEY(`bookmarkId`, `todoListId`),
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todoListId`) REFERENCES `todoLists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarksInTodoLists_bookmarkId_idx` ON `bookmarksInTodoLists` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarksInTodoLists_todoListId_idx` ON `bookmarksInTodoLists` (`todoListId`);--> statement-breakpoint
CREATE INDEX `bookmarksInTodoLists_todoListId_bookmarkId_idx` ON `bookmarksInTodoLists` (`todoListId`,`bookmarkId`);