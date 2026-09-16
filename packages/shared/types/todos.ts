import { z } from "zod";

import { zBookmarkSchema } from "./bookmarks";
import { zTagBasicSchema } from "./tags";

export const MAX_TODO_LIST_NAME_LENGTH = 100;
export const MAX_TODO_ITEM_TEXT_LENGTH = 2000;

export const zNewTodoListSchema = z.object({
  name: z
    .string()
    .min(1, "Todo list name can't be empty")
    .max(
      MAX_TODO_LIST_NAME_LENGTH,
      `Todo list name is at most ${MAX_TODO_LIST_NAME_LENGTH} chars`,
    ),
  icon: z.string().optional().default("📋"),
});

export const zTodoListSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  createdAt: z.date(),
  itemsCount: z.number(),
  doneCount: z.number(),
  // Todo lists share bookmarks' tag pool (`bookmarkTags`) - there is no
  // separate "todo tags" concept.
  tags: z.array(zTagBasicSchema),
});

export type ZTodoList = z.infer<typeof zTodoListSchema>;

export const zEditTodoListSchema = z.object({
  todoListId: z.string(),
  name: z
    .string()
    .min(1, "Todo list name can't be empty")
    .max(
      MAX_TODO_LIST_NAME_LENGTH,
      `Todo list name is at most ${MAX_TODO_LIST_NAME_LENGTH} chars`,
    )
    .optional(),
  icon: z.string().min(1).optional(),
});

export const zTodoItemSchema = z.object({
  id: z.string(),
  todoListId: z.string(),
  text: z.string(),
  done: z.boolean(),
  position: z.number(),
  createdAt: z.date(),
  // Todo items share the same tag pool todo lists/bookmarks use
  // (`bookmarkTags`) - there is no separate "todo item tags" concept.
  tags: z.array(zTagBasicSchema),
});

export type ZTodoItem = z.infer<typeof zTodoItemSchema>;

export const zNewTodoItemSchema = z.object({
  todoListId: z.string(),
  text: z
    .string()
    .min(1, "Todo item text can't be empty")
    .max(
      MAX_TODO_ITEM_TEXT_LENGTH,
      `Todo item text is at most ${MAX_TODO_ITEM_TEXT_LENGTH} chars`,
    ),
});

export const zEditTodoItemSchema = z.object({
  todoItemId: z.string(),
  text: z
    .string()
    .min(1, "Todo item text can't be empty")
    .max(
      MAX_TODO_ITEM_TEXT_LENGTH,
      `Todo item text is at most ${MAX_TODO_ITEM_TEXT_LENGTH} chars`,
    )
    .optional(),
  done: z.boolean().optional(),
});

export const zReorderTodoItemsSchema = z.object({
  todoListId: z.string(),
  orderedItemIds: z.array(z.string()).min(1),
});

// Tags on todo lists reuse the user's shared bookmark tag pool, so tags are
// referenced the same way bookmarks reference them: by an existing tag's id,
// or by name (creating the tag if it doesn't exist yet).
export const zManipulateTodoListTagSchema = z
  .object({
    tagId: z.string().optional(),
    tagName: z.string().optional(),
  })
  .refine((val) => !!val.tagId || !!val.tagName, {
    message: "You must provide either a tagId or a tagName",
    path: ["tagId", "tagName"],
  });

export const zUpdateTodoListTagsSchema = z.object({
  todoListId: z.string(),
  attach: z.array(zManipulateTodoListTagSchema),
  detach: z.array(zManipulateTodoListTagSchema),
});

// Tags on todo items reuse the exact same shared bookmark-tag identifier
// shape as todo lists (`zManipulateTodoListTagSchema` is generic enough - by
// tagId or tagName - to reuse directly rather than defining an identical
// "todo item" variant).
export const zUpdateTodoItemTagsSchema = z.object({
  todoItemId: z.string(),
  attach: z.array(zManipulateTodoListTagSchema),
  detach: z.array(zManipulateTodoListTagSchema),
});

// Bookmarks linked to a todo list (forward direction only: a todo list knows
// which bookmarks it links to; a bookmark's own page doesn't yet show which
// todo lists reference it back). A linked bookmark is a real bookmark, so
// this reuses bookmarks' own `zBookmarkSchema` rather than inventing a
// separate "compact bookmark" shape just for todo lists.
export const zTodoListLinkedBookmarksSchema = z.object({
  bookmarks: z.array(zBookmarkSchema),
});
export type ZTodoListLinkedBookmarks = z.infer<
  typeof zTodoListLinkedBookmarksSchema
>;

export const zAttachBookmarkToTodoListSchema = z.object({
  todoListId: z.string(),
  bookmarkId: z.string(),
});

export const zDetachBookmarkFromTodoListSchema = z.object({
  todoListId: z.string(),
  bookmarkId: z.string(),
});

// Bookmarks linked to a todo item - the exact same shape as todo-list-level
// linked bookmarks (forward direction only: an item knows which bookmarks
// it links to; a bookmark's own page doesn't yet show which todo items
// reference it back), one level down. Reuses the same `zBookmarkSchema`
// bookmarks and todo-list linked bookmarks use.
export const zTodoItemLinkedBookmarksSchema = z.object({
  bookmarks: z.array(zBookmarkSchema),
});
export type ZTodoItemLinkedBookmarks = z.infer<
  typeof zTodoItemLinkedBookmarksSchema
>;

export const zAttachBookmarkToTodoItemSchema = z.object({
  todoItemId: z.string(),
  bookmarkId: z.string(),
});

export const zDetachBookmarkFromTodoItemSchema = z.object({
  todoItemId: z.string(),
  bookmarkId: z.string(),
});
