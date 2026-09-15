CREATE TABLE `tagsOnTodoLists` (
	`todoListId` text NOT NULL,
	`tagId` text NOT NULL,
	`attachedAt` integer,
	PRIMARY KEY(`todoListId`, `tagId`),
	FOREIGN KEY (`todoListId`) REFERENCES `todoLists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tagsOnTodoLists_tagId_idx` ON `tagsOnTodoLists` (`tagId`);--> statement-breakpoint
CREATE INDEX `tagsOnTodoLists_todoListId_idx` ON `tagsOnTodoLists` (`todoListId`);