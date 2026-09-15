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
import { TodoListsRepo } from "./todoLists.repo";

type TodoList = z.infer<typeof zTodoListSchema>;
type TodoItem = z.infer<typeof zTodoItemSchema>;

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
    return authorize(list, () => assertOwnership(actor, list.userId));
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

  async reorderItems(
    list: Authorized<TodoList>,
    orderedItemIds: string[],
  ): Promise<TodoItem[]> {
    return await this.repo.reorderItems(list.id, orderedItemIds);
  }
}
