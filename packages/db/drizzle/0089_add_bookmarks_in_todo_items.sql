CREATE TABLE `bookmarksInTodoItems` (
	`bookmarkId` text NOT NULL,
	`todoItemId` text NOT NULL,
	`addedAt` integer,
	PRIMARY KEY(`bookmarkId`, `todoItemId`),
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`todoItemId`) REFERENCES `todoItems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarksInTodoItems_bookmarkId_idx` ON `bookmarksInTodoItems` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarksInTodoItems_todoItemId_idx` ON `bookmarksInTodoItems` (`todoItemId`);--> statement-breakpoint
CREATE INDEX `bookmarksInTodoItems_todoItemId_bookmarkId_idx` ON `bookmarksInTodoItems` (`todoItemId`,`bookmarkId`);