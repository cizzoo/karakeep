CREATE TABLE `tagsOnTodoItems` (
	`todoItemId` text NOT NULL,
	`tagId` text NOT NULL,
	`attachedAt` integer,
	PRIMARY KEY(`todoItemId`, `tagId`),
	FOREIGN KEY (`todoItemId`) REFERENCES `todoItems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tagsOnTodoItems_tagId_idx` ON `tagsOnTodoItems` (`tagId`);--> statement-breakpoint
CREATE INDEX `tagsOnTodoItems_todoItemId_idx` ON `tagsOnTodoItems` (`todoItemId`);