import { z } from "zod";

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
