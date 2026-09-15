import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import { todoItems, todoLists } from "@karakeep/db/schema";
import {
  zNewTodoListSchema,
  zTodoItemSchema,
  zTodoListSchema,
} from "@karakeep/shared/types/todos";

type TodoList = z.infer<typeof zTodoListSchema>;
type TodoItem = z.infer<typeof zTodoItemSchema>;

const itemsCountExpr = sql<number>`COUNT(${todoItems.id})`;
const doneCountExpr = sql<number>`SUM(CASE WHEN ${todoItems.done} THEN 1 ELSE 0 END)`;

export class TodoListsRepo {
  constructor(private db: DB) {}

  async listForUser(userId: string): Promise<TodoList[]> {
    const rows = await this.db
      .select({
        id: todoLists.id,
        name: todoLists.name,
        icon: todoLists.icon,
        createdAt: todoLists.createdAt,
        itemsCount: itemsCountExpr.as("itemsCount"),
        doneCount: doneCountExpr.as("doneCount"),
      })
      .from(todoLists)
      .leftJoin(todoItems, eq(todoItems.todoListId, todoLists.id))
      .where(eq(todoLists.userId, userId))
      .groupBy(todoLists.id)
      .orderBy(desc(todoLists.createdAt));

    return rows.map((row) => ({
      ...row,
      itemsCount: Number(row.itemsCount),
      doneCount: Number(row.doneCount ?? 0),
    }));
  }

  async getTodoList(
    id: string,
  ): Promise<(TodoList & { userId: string }) | null> {
    const [row] = await this.db
      .select({
        id: todoLists.id,
        name: todoLists.name,
        icon: todoLists.icon,
        userId: todoLists.userId,
        createdAt: todoLists.createdAt,
        itemsCount: itemsCountExpr.as("itemsCount"),
        doneCount: doneCountExpr.as("doneCount"),
      })
      .from(todoLists)
      .leftJoin(todoItems, eq(todoItems.todoListId, todoLists.id))
      .where(eq(todoLists.id, id))
      .groupBy(todoLists.id);

    if (!row) {
      return null;
    }

    return {
      ...row,
      itemsCount: Number(row.itemsCount),
      doneCount: Number(row.doneCount ?? 0),
    };
  }

  async createTodoList(
    userId: string,
    input: z.infer<typeof zNewTodoListSchema>,
  ): Promise<TodoList> {
    const [result] = await this.db
      .insert(todoLists)
      .values({
        name: input.name,
        icon: input.icon,
        userId,
      })
      .returning();

    return {
      id: result.id,
      name: result.name,
      icon: result.icon,
      createdAt: result.createdAt,
      itemsCount: 0,
      doneCount: 0,
    };
  }

  async editTodoList(
    id: string,
    input: { name?: string; icon?: string },
  ): Promise<TodoList | null> {
    const result = await this.db
      .update(todoLists)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
      })
      .where(eq(todoLists.id, id))
      .returning();

    if (result.length === 0) {
      return null;
    }

    return this.getTodoList(id);
  }

  async deleteTodoList(
    id: string,
  ): Promise<typeof todoLists.$inferSelect | null> {
    const [result] = await this.db
      .delete(todoLists)
      .where(eq(todoLists.id, id))
      .returning();

    return result ?? null;
  }

  async getItems(todoListId: string): Promise<TodoItem[]> {
    return await this.db.query.todoItems.findMany({
      where: eq(todoItems.todoListId, todoListId),
      orderBy: [asc(todoItems.position)],
    });
  }

  async getItemWithListOwner(
    itemId: string,
  ): Promise<{ item: TodoItem; listUserId: string } | null> {
    const [row] = await this.db
      .select({
        id: todoItems.id,
        todoListId: todoItems.todoListId,
        text: todoItems.text,
        done: todoItems.done,
        position: todoItems.position,
        createdAt: todoItems.createdAt,
        listUserId: todoLists.userId,
      })
      .from(todoItems)
      .innerJoin(todoLists, eq(todoItems.todoListId, todoLists.id))
      .where(eq(todoItems.id, itemId));

    if (!row) {
      return null;
    }

    const { listUserId, ...item } = row;
    return { item, listUserId };
  }

  async addItem(todoListId: string, text: string): Promise<TodoItem> {
    const [maxRow] = await this.db
      .select({ maxPosition: sql<number | null>`MAX(${todoItems.position})` })
      .from(todoItems)
      .where(eq(todoItems.todoListId, todoListId));

    // Empty lists have no max position, so the first item starts at 0.
    const position = maxRow?.maxPosition != null ? maxRow.maxPosition + 1 : 0;

    const [result] = await this.db
      .insert(todoItems)
      .values({ todoListId, text, position })
      .returning();

    return result;
  }

  async editItem(
    itemId: string,
    input: { text?: string; done?: boolean },
  ): Promise<TodoItem | null> {
    const result = await this.db
      .update(todoItems)
      .set({
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.done !== undefined ? { done: input.done } : {}),
      })
      .where(eq(todoItems.id, itemId))
      .returning();

    return result[0] ?? null;
  }

  async deleteItem(itemId: string): Promise<TodoItem | null> {
    const result = await this.db
      .delete(todoItems)
      .where(eq(todoItems.id, itemId))
      .returning();

    return result[0] ?? null;
  }

  async reorderItems(
    todoListId: string,
    orderedItemIds: string[],
  ): Promise<TodoItem[]> {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < orderedItemIds.length; i++) {
        await tx
          .update(todoItems)
          .set({ position: i })
          .where(
            and(
              eq(todoItems.id, orderedItemIds[i]),
              eq(todoItems.todoListId, todoListId),
            ),
          );
      }
    });

    return this.getItems(todoListId);
  }
}
