import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  zEditTodoItemSchema,
  zEditTodoListSchema,
  zNewTodoListSchema,
  zTodoItemSchema,
  zTodoListSchema,
} from "@karakeep/shared/types/todos";

import type { Actor, Authorized } from "../lib/actor";
import { actorUserId, assertOwnership, authorize } from "../lib/actor";
import type { TagIdentifier } from "../lib/tags";
import { TodoListsRepo } from "./todoLists.repo";

type TodoList = z.infer<typeof zTodoListSchema>;
type TodoItem = z.infer<typeof zTodoItemSchema>;
type TodoListTag = TodoList["tags"][number];

export class TodoListsService {
  private repo: TodoListsRepo;

  constructor(db: DB) {
    this.repo = new TodoListsRepo(db);
  }

  async getTodoList(actor: Actor, id: string): Promise<Authorized<TodoList>> {
    const list = await this.repo.getTodoList(id);
    if (!list) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Todo list not found",
      });
    }
    return authorize(list, () =>
      assertOwnership(actor, list.userId, {
        notFoundOnDeny: true,
        notFoundMessage: "Todo list not found",
      }),
    );
  }

  async listForUser(actor: Actor): Promise<TodoList[]> {
    return await this.repo.listForUser(actorUserId(actor));
  }

  async createTodoList(
    actor: Actor,
    input: z.infer<typeof zNewTodoListSchema>,
  ): Promise<TodoList> {
    return await this.repo.createTodoList(actorUserId(actor), input);
  }

  async editTodoList(
    list: Authorized<TodoList>,
    input: Omit<z.infer<typeof zEditTodoListSchema>, "todoListId">,
  ): Promise<TodoList> {
    const updated = await this.repo.editTodoList(list.id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }

  async deleteTodoList(list: Authorized<TodoList>): Promise<TodoList> {
    const deleted = await this.repo.deleteTodoList(list.id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return list;
  }

  async getItemWithOwner(
    actor: Actor,
    itemId: string,
  ): Promise<Authorized<TodoItem>> {
    const result = await this.repo.getItemWithListOwner(itemId);
    if (!result) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Todo item not found",
      });
    }
    const { item, listUserId } = result;
    return authorize(item, () => assertOwnership(actor, listUserId));
  }

  async getItems(list: Authorized<TodoList>): Promise<TodoItem[]> {
    return await this.repo.getItems(list.id);
  }

  async addItem(list: Authorized<TodoList>, text: string): Promise<TodoItem> {
    return await this.repo.addItem(list.id, text);
  }

  async editItem(
    item: Authorized<TodoItem>,
    input: Omit<z.infer<typeof zEditTodoItemSchema>, "todoItemId">,
  ): Promise<TodoItem> {
    const updated = await this.repo.editItem(item.id, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return updated;
  }

  async deleteItem(item: Authorized<TodoItem>): Promise<TodoItem> {
    const deleted = await this.repo.deleteItem(item.id);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return deleted;
  }

  async moveItem(
    actor: Actor,
    item: Authorized<TodoItem>,
    targetTodoListId: string,
  ): Promise<TodoItem> {
    // Verify the *target* list belongs to this actor too - reuses
    // getTodoList's existing NOT_FOUND/ownership checks rather than
    // reimplementing them here. The item's *current* list ownership was
    // already verified by the caller (the `Authorized<TodoItem>` type).
    await this.getTodoList(actor, targetTodoListId);

    const moved = await this.repo.moveItem(item.id, targetTodoListId);
    if (!moved) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    return moved;
  }

  async reorderItems(
    list: Authorized<TodoList>,
    orderedItemIds: string[],
  ): Promise<TodoItem[]> {
    return await this.repo.reorderItems(list.id, orderedItemIds);
  }

  async getTags(list: Authorized<TodoList>): Promise<TodoListTag[]> {
    return await this.repo.getTags(list.id);
  }

  async updateTags(
    actor: Actor,
    list: Authorized<TodoList>,
    attach: TagIdentifier[],
    detach: TagIdentifier[],
  ): Promise<{ attached: string[]; detached: string[] }> {
    return await this.repo.updateTags(
      actorUserId(actor),
      list.id,
      attach,
      detach,
    );
  }

  async updateItemTags(
    actor: Actor,
    item: Authorized<TodoItem>,
    attach: TagIdentifier[],
    detach: TagIdentifier[],
  ): Promise<{
    attached: string[];
    detached: string[];
    todoListId: string;
  }> {
    const result = await this.repo.updateItemTags(
      actorUserId(actor),
      item.id,
      attach,
      detach,
    );
    // The caller (router/hooks) needs the item's todoListId to invalidate
    // the right `getItems` cache - the mutation's own input only carries
    // `todoItemId`, mirroring how `editItem`'s output carries `todoListId`
    // for the same reason. Re-fetched rather than read from the
    // pre-mutation `item`, which would be stale if the item was moved to a
    // different list concurrently with this tag update.
    const current = await this.repo.getItemWithListOwner(item.id);
    return {
      ...result,
      todoListId: current?.item.todoListId ?? item.todoListId,
    };
  }

  async getLinkedBookmarkIds(list: Authorized<TodoList>): Promise<string[]> {
    return await this.repo.getLinkedBookmarkIds(list.id);
  }

  async attachBookmark(
    actor: Actor,
    list: Authorized<TodoList>,
    bookmarkId: string,
  ): Promise<void> {
    // The todo list's ownership was already verified by the caller (the
    // `Authorized<TodoList>` type). Here we additionally have to verify the
    // *bookmark* being attached belongs to the same actor - otherwise a user
    // could link someone else's bookmarkId into their own todo list.
    const bookmarkOwnerId = await this.repo.getBookmarkOwnerId(bookmarkId);
    if (!bookmarkOwnerId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }
    // Mirrors BareBookmark.bareFromId()'s privacy behavior: a bookmark
    // owned by someone else looks the same as one that doesn't exist.
    assertOwnership(actor, bookmarkOwnerId, {
      notFoundOnDeny: true,
      notFoundMessage: "Bookmark not found",
    });

    await this.repo.attachBookmark(list.id, bookmarkId);
  }

  async detachBookmark(
    list: Authorized<TodoList>,
    bookmarkId: string,
  ): Promise<void> {
    await this.repo.detachBookmark(list.id, bookmarkId);
  }

  async getLinkedBookmarkIdsForItem(
    item: Authorized<TodoItem>,
  ): Promise<string[]> {
    return await this.repo.getLinkedBookmarkIdsForItem(item.id);
  }

  async attachBookmarkToItem(
    actor: Actor,
    item: Authorized<TodoItem>,
    bookmarkId: string,
  ): Promise<void> {
    // Mirrors `attachBookmark` above: the item's ownership was already
    // verified by the caller (the `Authorized<TodoItem>` type). Here we
    // additionally have to verify the *bookmark* being attached belongs to
    // the same actor - otherwise a user could link someone else's
    // bookmarkId into their own todo item.
    const bookmarkOwnerId = await this.repo.getBookmarkOwnerId(bookmarkId);
    if (!bookmarkOwnerId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }
    // Mirrors BareBookmark.bareFromId()'s privacy behavior: a bookmark
    // owned by someone else looks the same as one that doesn't exist.
    assertOwnership(actor, bookmarkOwnerId, {
      notFoundOnDeny: true,
      notFoundMessage: "Bookmark not found",
    });

    await this.repo.attachBookmarkToItem(item.id, bookmarkId);
  }

  async detachBookmarkFromItem(
    item: Authorized<TodoItem>,
    bookmarkId: string,
  ): Promise<void> {
    await this.repo.detachBookmarkFromItem(item.id, bookmarkId);
  }
}
