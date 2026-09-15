PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tagsOnTodoItems` (
	`todoItemId` text NOT NULL,
	`tagId` text NOT NULL,
	`userId` text NOT NULL,
	`attachedAt` integer,
	PRIMARY KEY(`todoItemId`, `tagId`),
	FOREIGN KEY (`todoItemId`) REFERENCES `todoItems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tagsOnTodoItems`("todoItemId", "tagId", "userId", "attachedAt") SELECT `tagsOnTodoItems`.`todoItemId`, `tagsOnTodoItems`.`tagId`, `todoLists`.`userId`, `tagsOnTodoItems`.`attachedAt` FROM `tagsOnTodoItems` JOIN `todoItems` ON `todoItems`.`id` = `tagsOnTodoItems`.`todoItemId` JOIN `todoLists` ON `todoLists`.`id` = `todoItems`.`todoListId`;--> statement-breakpoint
DROP TABLE `tagsOnTodoItems`;--> statement-breakpoint
ALTER TABLE `__new_tagsOnTodoItems` RENAME TO `tagsOnTodoItems`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tagsOnTodoItems_tagId_idx` ON `tagsOnTodoItems` (`tagId`);--> statement-breakpoint
CREATE INDEX `tagsOnTodoItems_todoItemId_idx` ON `tagsOnTodoItems` (`todoItemId`);--> statement-breakpoint
CREATE TABLE `__new_tagsOnTodoLists` (
	`todoListId` text NOT NULL,
	`tagId` text NOT NULL,
	`userId` text NOT NULL,
	`attachedAt` integer,
	PRIMARY KEY(`todoListId`, `tagId`),
	FOREIGN KEY (`todoListId`) REFERENCES `todoLists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tagsOnTodoLists`("todoListId", "tagId", "userId", "attachedAt") SELECT `tagsOnTodoLists`.`todoListId`, `tagsOnTodoLists`.`tagId`, `todoLists`.`userId`, `tagsOnTodoLists`.`attachedAt` FROM `tagsOnTodoLists` JOIN `todoLists` ON `todoLists`.`id` = `tagsOnTodoLists`.`todoListId`;--> statement-breakpoint
DROP TABLE `tagsOnTodoLists`;--> statement-breakpoint
ALTER TABLE `__new_tagsOnTodoLists` RENAME TO `tagsOnTodoLists`;--> statement-breakpoint
CREATE INDEX `tagsOnTodoLists_tagId_idx` ON `tagsOnTodoLists` (`tagId`);--> statement-breakpoint
CREATE INDEX `tagsOnTodoLists_todoListId_idx` ON `tagsOnTodoLists` (`todoListId`);