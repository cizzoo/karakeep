import { experimental_trpcMiddleware } from "@trpc/server";
import { z } from "zod";

import { MAX_NUM_BOOKMARKS_PER_PAGE } from "@karakeep/shared/types/bookmarks";
import {
  zAttachBookmarkToTodoItemSchema,
  zAttachBookmarkToTodoListSchema,
  zDetachBookmarkFromTodoItemSchema,
  zDetachBookmarkFromTodoListSchema,
  zEditTodoItemSchema,
  zEditTodoListSchema,
  zNewTodoItemSchema,
  zNewTodoListSchema,
  zReorderTodoItemsSchema,
  zTodoItemLinkedBookmarksSchema,
  zTodoItemSchema,
  zTodoListLinkedBookmarksSchema,
  zTodoListSchema,
  zUpdateTodoItemTagsSchema,
  zUpdateTodoListTagsSchema,
} from "@karakeep/shared/types/todos";

import type { AuthedContext } from "../index";
import { createScopedAuthedProcedure, router } from "../index";
import { actorFromContext } from "../lib/actor";
import { Bookmark } from "../models/bookmarks";
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
  get: todoListsProcedure
    .input(z.object({ todoListId: z.string() }))
    .output(zTodoListSchema)
    .use(ensureTodoListOwnership)
    .query(async ({ ctx }) => {
      return ctx.todoList;
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
  // Moves an existing item into a DIFFERENT todo list owned by the same
  // actor. `ensureTodoItemOwnership` only validates the item's *current*
  // list ownership - the *target* list's ownership is separately checked
  // inside the service method (via `getTodoList`), so a user can't move
  // their item into someone else's list.
  moveItem: todoListsProcedure
    .input(z.object({ todoItemId: z.string(), targetTodoListId: z.string() }))
    .output(zTodoItemSchema)
    .use(ensureTodoItemOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.moveItem(
        ctx.actor,
        ctx.todoItem,
        input.targetTodoListId,
      );
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
  // Tags on todo lists reuse the user's shared bookmark tag pool. `get`/`list`
  // already include a list's tags, so this mutation is the only extra
  // procedure needed to edit them.
  updateTags: todoListsProcedure
    .input(zUpdateTodoListTagsSchema)
    .output(
      z.object({
        attached: z.array(z.string()),
        detached: z.array(z.string()),
      }),
    )
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.updateTags(
        ctx.actor,
        ctx.todoList,
        input.attach,
        input.detach,
      );
    }),
  // Tags on todo items reuse the user's shared bookmark tag pool, the exact
  // same way todo list tags do (see `updateTags` above). `getItems` already
  // includes each item's tags, so this mutation is the only extra procedure
  // needed to edit them.
  updateItemTags: todoListsProcedure
    .input(zUpdateTodoItemTagsSchema)
    .output(
      z.object({
        attached: z.array(z.string()),
        detached: z.array(z.string()),
        todoListId: z.string(),
      }),
    )
    .use(ensureTodoItemOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.todoListsService.updateItemTags(
        ctx.actor,
        ctx.todoItem,
        input.attach,
        input.detach,
      );
    }),
  // Bookmarks linked to a todo list (forward direction only, see
  // AGENT-todo.md). The service only resolves the linked bookmark ids;
  // hydrating them into full `ZBookmark`s reuses `Bookmark.loadMulti` (the
  // same path `bookmarks.getBookmarks` uses) rather than re-deriving
  // bookmark rendering data from scratch here.
  getLinkedBookmarks: todoListsProcedure
    .input(z.object({ todoListId: z.string() }))
    .output(zTodoListLinkedBookmarksSchema)
    .use(ensureTodoListOwnership)
    .query(async ({ ctx }) => {
      const bookmarkIds = await ctx.todoListsService.getLinkedBookmarkIds(
        ctx.todoList,
      );
      if (bookmarkIds.length === 0) {
        return { bookmarks: [] };
      }

      const { bookmarks } = await Bookmark.loadMulti(ctx, {
        ids: bookmarkIds,
        limit: Math.min(bookmarkIds.length, MAX_NUM_BOOKMARKS_PER_PAGE),
        sortOrder: "desc", // Doesn't matter, we re-order by addedAt below
        includeContent: false,
      });
      const bookmarksById = new Map(bookmarks.map((b) => [b.id, b] as const));

      // Preserve the join table's own ordering (most recently linked first)
      // rather than whatever order loadMulti happens to return.
      return {
        bookmarks: bookmarkIds.flatMap((id) => {
          const bookmark = bookmarksById.get(id);
          return bookmark ? [bookmark.asZBookmark()] : [];
        }),
      };
    }),
  attachBookmark: todoListsProcedure
    .input(zAttachBookmarkToTodoListSchema)
    .output(z.void())
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.todoListsService.attachBookmark(
        ctx.actor,
        ctx.todoList,
        input.bookmarkId,
      );
    }),
  detachBookmark: todoListsProcedure
    .input(zDetachBookmarkFromTodoListSchema)
    .output(z.void())
    .use(ensureTodoListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.todoListsService.detachBookmark(ctx.todoList, input.bookmarkId);
    }),
  // Bookmarks linked to a todo item (forward direction only, mirroring
  // `getLinkedBookmarks`/`attachBookmark`/`detachBookmark` above one level
  // down - see their comments for the rationale).
  getLinkedBookmarksForItem: todoListsProcedure
    .input(z.object({ todoItemId: z.string() }))
    .output(zTodoItemLinkedBookmarksSchema)
    .use(ensureTodoItemOwnership)
    .query(async ({ ctx }) => {
      const bookmarkIds =
        await ctx.todoListsService.getLinkedBookmarkIdsForItem(ctx.todoItem);
      if (bookmarkIds.length === 0) {
        return { bookmarks: [] };
      }

      const { bookmarks } = await Bookmark.loadMulti(ctx, {
        ids: bookmarkIds,
        limit: Math.min(bookmarkIds.length, MAX_NUM_BOOKMARKS_PER_PAGE),
        sortOrder: "desc", // Doesn't matter, we re-order by addedAt below
        includeContent: false,
      });
      const bookmarksById = new Map(bookmarks.map((b) => [b.id, b] as const));

      // Preserve the join table's own ordering (most recently linked first)
      // rather than whatever order loadMulti happens to return.
      return {
        bookmarks: bookmarkIds.flatMap((id) => {
          const bookmark = bookmarksById.get(id);
          return bookmark ? [bookmark.asZBookmark()] : [];
        }),
      };
    }),
  attachBookmarkToItem: todoListsProcedure
    .input(zAttachBookmarkToTodoItemSchema)
    .output(z.void())
    .use(ensureTodoItemOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.todoListsService.attachBookmarkToItem(
        ctx.actor,
        ctx.todoItem,
        input.bookmarkId,
      );
    }),
  detachBookmarkFromItem: todoListsProcedure
    .input(zDetachBookmarkFromTodoItemSchema)
    .output(z.void())
    .use(ensureTodoItemOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.todoListsService.detachBookmarkFromItem(
        ctx.todoItem,
        input.bookmarkId,
      );
    }),
});
