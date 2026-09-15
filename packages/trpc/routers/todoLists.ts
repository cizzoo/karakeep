import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import {
  zEditTodoItemSchema,
  zEditTodoListSchema,
  zNewTodoItemSchema,
  zNewTodoListSchema,
  zReorderTodoItemsSchema,
  zTodoItemSchema,
  zTodoListSchema,
} from "@karakeep/shared/types/todos";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { TodoListsService } from "../models/todoLists.service";

const todoListsProcedure = createScopedAuthedProcedure("todoLists").use(
  (opts) => {
    return opts.next({
      ctx: {
        ...opts.ctx,
        actor: actorFromContext(opts.ctx),
        todoListsService: new TodoListsService(opts.ctx.db),
      },
    });
  },
);

type TodoListsContext = AuthedContext & {
  actor: ReturnType<typeof actorFromContext>;
  todoListsService: TodoListsService;
};

const ensureTodoListOwnership = experimental_trpcMiddleware<{
  ctx: TodoListsContext;
  input: { todoListId: string };
}>().create(async (opts) => {
  const todoList = await opts.ctx.todoListsService.getTodoList(
    opts.ctx.actor,
    opts.input.todoListId,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      todoList,
    },
  });
});

const ensureTodoItemOwnership = experimental_trpcMiddleware<{
  ctx: TodoListsContext;
  input: { todoItemId: string };
}>().create(async (opts) => {
  const todoItem = await opts.ctx.todoListsService.getItemWithOwner(
    opts.ctx.actor,
    opts.input.todoItemId,
  );

  return opts.next({
    ctx: {
      ...opts.ctx,
      todoItem,
    },
  });
});

export const todoListsAppRouter = router({
  list: todoListsProcedure
    .output(z.object({ todoLists: z.array(zTodoListSchema) }))
    .query(async ({ ctx }) => {
      return { todoLists: await ctx.todoListsService.listForUser(ctx.actor) };
    }),
  create: todoListsProcedure
    .input(zNewTodoListSchema)
    .output(zTodoListSchema)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.createTodoList(ctx.actor, input);
    }),
  edit: todoListsProcedure
    .input(zEditTodoListSchema)
    .output(zTodoListSchema)
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.editTodoList(ctx.todoList, input);
    }),
  delete: todoListsProcedure
    .input(z.object({ todoListId: z.string() }))
    .output(zTodoListSchema)
    .use(ensureTodoListOwnership)
    .mutation(async ({ ctx }) => {
      return await ctx.todoListsService.deleteTodoList(ctx.todoList);
    }),
  getItems: todoListsProcedure
    .input(z.object({ todoListId: z.string() }))
    .output(z.object({ items: z.array(zTodoItemSchema) }))
    .use(ensureTodoListOwnership)
    .query(async ({ ctx }) => {
      return { items: await ctx.todoListsService.getItems(ctx.todoList) };
    }),
  addItem: todoListsProcedure
    .input(zNewTodoItemSchema)
    .output(zTodoItemSchema)
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.addItem(ctx.todoList, input.text);
    }),
  editItem: todoListsProcedure
    .input(zEditTodoItemSchema)
    .output(zTodoItemSchema)
    .use(ensureTodoItemOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.editItem(ctx.todoItem, input);
    }),
  deleteItem: todoListsProcedure
    .input(z.object({ todoItemId: z.string() }))
    .output(zTodoItemSchema)
    .use(ensureTodoItemOwnership)
    .mutation(async ({ ctx }) => {
      return await ctx.todoListsService.deleteItem(ctx.todoItem);
    }),
  reorderItems: todoListsProcedure
    .input(zReorderTodoItemsSchema)
    .output(z.object({ items: z.array(zTodoItemSchema) }))
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      return {
        items: await ctx.todoListsService.reorderItems(
          ctx.todoList,
          input.orderedItemIds,
        ),
      };
    }),
});
