import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import type { DB } from "@karakeep/db";
import {
  bookmarks,
  bookmarksInTodoItems,
  bookmarksInTodoLists,
  bookmarkTags,
  tagsOnTodoItems,
  tagsOnTodoLists,
  todoItems,
  todoLists,
} from "@karakeep/db/schema";
import {
  zNewTodoListSchema,
  zTodoItemSchema,
  zTodoListSchema,
} from "@karakeep/shared/types/todos";
import { normalizeTagName } from "@karakeep/shared/utils/tag";

import type { TagIdentifier } from "../lib/tags";
import { ensureTagsExistByName, resolveTagIdentifiers } from "../lib/tags";

type TodoList = z.infer<typeof zTodoListSchema>;
type TodoItem = z.infer<typeof zTodoItemSchema>;
type TodoListTag = TodoList["tags"][number];
type TodoItemTag = TodoItem["tags"][number];

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

    const tagsByListId = await this.getTagsForLists(rows.map((r) => r.id));

    return rows.map((row) => ({
      ...row,
      itemsCount: Number(row.itemsCount),
      doneCount: Number(row.doneCount ?? 0),
      tags: tagsByListId.get(row.id) ?? [],
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
      tags: await this.getTags(id),
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
      tags: [],
    };
  }

  async getTags(todoListId: string): Promise<TodoListTag[]> {
    return await this.db
      .select({ id: bookmarkTags.id, name: bookmarkTags.name })
      .from(tagsOnTodoLists)
      .innerJoin(bookmarkTags, eq(tagsOnTodoLists.tagId, bookmarkTags.id))
      .where(eq(tagsOnTodoLists.todoListId, todoListId))
      .orderBy(asc(bookmarkTags.name));
  }

  async getTagsForLists(
    todoListIds: string[],
  ): Promise<Map<string, TodoListTag[]>> {
    const map = new Map<string, TodoListTag[]>();
    if (todoListIds.length === 0) {
      return map;
    }

    const rows = await this.db
      .select({
        todoListId: tagsOnTodoLists.todoListId,
        id: bookmarkTags.id,
        name: bookmarkTags.name,
      })
      .from(tagsOnTodoLists)
      .innerJoin(bookmarkTags, eq(tagsOnTodoLists.tagId, bookmarkTags.id))
      .where(inArray(tagsOnTodoLists.todoListId, todoListIds))
      .orderBy(asc(bookmarkTags.name));

    for (const row of rows) {
      const tags = map.get(row.todoListId) ?? [];
      tags.push({ id: row.id, name: row.name });
      map.set(row.todoListId, tags);
    }
    return map;
  }

  async updateTags(
    userId: string,
    todoListId: string,
    attach: TagIdentifier[],
    detach: TagIdentifier[],
  ): Promise<{ attached: string[]; detached: string[] }> {
    const normalizedAttach = attach.map((t) => ({
      tagId: t.tagId,
      tagName: t.tagName ? normalizeTagName(t.tagName) : undefined,
    }));

    // Create any not-yet-existing tags (reuses an existing row by name
    // rather than duplicating it - see ensureTagsExistByName).
    const toCreateNames = normalizedAttach
      .flatMap((t) => (t.tagName ? [t.tagName] : []))
      .filter((n) => n.length > 0);
    await ensureTagsExistByName(this.db, userId, toCreateNames);

    const [attachTags, detachTags] = await Promise.all([
      resolveTagIdentifiers(this.db, userId, normalizedAttach),
      resolveTagIdentifiers(this.db, userId, detach),
    ]);

    const idsToAttach = attachTags.map((t) => t.id);
    const idsToDetach = detachTags.map((t) => t.id);

    await this.db.transaction((tx) => {
      if (idsToDetach.length > 0) {
        tx.delete(tagsOnTodoLists)
          .where(
            and(
              eq(tagsOnTodoLists.todoListId, todoListId),
              inArray(tagsOnTodoLists.tagId, idsToDetach),
            ),
          )
          .run();
      }
      if (idsToAttach.length > 0) {
        tx.insert(tagsOnTodoLists)
          .values(idsToAttach.map((tagId) => ({ todoListId, tagId, userId })))
          .onConflictDoNothing()
          .run();
      }
    });

    return { attached: idsToAttach, detached: idsToDetach };
  }

  async getTagsForItems(
    todoItemIds: string[],
  ): Promise<Map<string, TodoItemTag[]>> {
    const map = new Map<string, TodoItemTag[]>();
    if (todoItemIds.length === 0) {
      return map;
    }

    const rows = await this.db
      .select({
        todoItemId: tagsOnTodoItems.todoItemId,
        id: bookmarkTags.id,
        name: bookmarkTags.name,
      })
      .from(tagsOnTodoItems)
      .innerJoin(bookmarkTags, eq(tagsOnTodoItems.tagId, bookmarkTags.id))
      .where(inArray(tagsOnTodoItems.todoItemId, todoItemIds))
      .orderBy(asc(bookmarkTags.name));

    for (const row of rows) {
      const tags = map.get(row.todoItemId) ?? [];
      tags.push({ id: row.id, name: row.name });
      map.set(row.todoItemId, tags);
    }
    return map;
  }

  async updateItemTags(
    userId: string,
    todoItemId: string,
    attach: TagIdentifier[],
    detach: TagIdentifier[],
  ): Promise<{ attached: string[]; detached: string[] }> {
    const normalizedAttach = attach.map((t) => ({
      tagId: t.tagId,
      tagName: t.tagName ? normalizeTagName(t.tagName) : undefined,
    }));

    // Create any not-yet-existing tags (reuses an existing row by name
    // rather than duplicating it - see ensureTagsExistByName).
    const toCreateNames = normalizedAttach
      .flatMap((t) => (t.tagName ? [t.tagName] : []))
      .filter((n) => n.length > 0);
    await ensureTagsExistByName(this.db, userId, toCreateNames);

    const [attachTags, detachTags] = await Promise.all([
      resolveTagIdentifiers(this.db, userId, normalizedAttach),
      resolveTagIdentifiers(this.db, userId, detach),
    ]);

    const idsToAttach = attachTags.map((t) => t.id);
    const idsToDetach = detachTags.map((t) => t.id);

    await this.db.transaction((tx) => {
      if (idsToDetach.length > 0) {
        tx.delete(tagsOnTodoItems)
          .where(
            and(
              eq(tagsOnTodoItems.todoItemId, todoItemId),
              inArray(tagsOnTodoItems.tagId, idsToDetach),
            ),
          )
          .run();
      }
      if (idsToAttach.length > 0) {
        tx.insert(tagsOnTodoItems)
          .values(idsToAttach.map((tagId) => ({ todoItemId, tagId, userId })))
          .onConflictDoNothing()
          .run();
      }
    });

    return { attached: idsToAttach, detached: idsToDetach };
  }

  async editTodoList(
    id: string,
    input: { name?: string; icon?: string },
  ): Promise<TodoList | null> {
    if (input.name === undefined && input.icon === undefined) {
      // No fields to update - treat as a no-op read instead of calling
      // drizzle's `.set({})`, which throws "No values to set".
      return this.getTodoList(id);
    }

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
    const items = await this.db.query.todoItems.findMany({
      where: eq(todoItems.todoListId, todoListId),
      orderBy: [asc(todoItems.position)],
    });

    const tagsByItemId = await this.getTagsForItems(items.map((i) => i.id));

    return items.map((item) => ({
      ...item,
      tags: tagsByItemId.get(item.id) ?? [],
    }));
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
    const tagsByItemId = await this.getTagsForItems([itemId]);
    return {
      item: { ...item, tags: tagsByItemId.get(itemId) ?? [] },
      listUserId,
    };
  }

  // Empty lists have no max position, so the first item starts at 0.
  // Shared by `addItem` and `moveItem` so a moved/newly-added item always
  // lands at the end of its (target) list.
  private async nextPositionForList(todoListId: string): Promise<number> {
    const [maxRow] = await this.db
      .select({ maxPosition: sql<number | null>`MAX(${todoItems.position})` })
      .from(todoItems)
      .where(eq(todoItems.todoListId, todoListId));

    return maxRow?.maxPosition != null ? maxRow.maxPosition + 1 : 0;
  }

  async addItem(todoListId: string, text: string): Promise<TodoItem> {
    const position = await this.nextPositionForList(todoListId);

    const [result] = await this.db
      .insert(todoItems)
      .values({ todoListId, text, position })
      .returning();

    return { ...result, tags: [] };
  }

  async editItem(
    itemId: string,
    input: { text?: string; done?: boolean },
  ): Promise<TodoItem | null> {
    if (input.text === undefined && input.done === undefined) {
      // No fields to update - treat as a no-op read instead of calling
      // drizzle's `.set({})`, which throws "No values to set".
      const [existing] = await this.db
        .select()
        .from(todoItems)
        .where(eq(todoItems.id, itemId));

      if (!existing) {
        return null;
      }

      const tagsByItemId = await this.getTagsForItems([existing.id]);
      return { ...existing, tags: tagsByItemId.get(existing.id) ?? [] };
    }

    const result = await this.db
      .update(todoItems)
      .set({
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.done !== undefined ? { done: input.done } : {}),
      })
      .where(eq(todoItems.id, itemId))
      .returning();

    if (result.length === 0) {
      return null;
    }

    const tagsByItemId = await this.getTagsForItems([result[0].id]);
    return { ...result[0], tags: tagsByItemId.get(result[0].id) ?? [] };
  }

  async deleteItem(itemId: string): Promise<TodoItem | null> {
    const result = await this.db
      .delete(todoItems)
      .where(eq(todoItems.id, itemId))
      .returning();

    if (result.length === 0) {
      return null;
    }
    // The item (and its tagsOnTodoItems rows, via cascade) is already gone,
    // so there's nothing left to look up.
    return { ...result[0], tags: [] };
  }

  async moveItem(
    itemId: string,
    targetTodoListId: string,
  ): Promise<TodoItem | null> {
    const position = await this.nextPositionForList(targetTodoListId);

    const result = await this.db
      .update(todoItems)
      .set({ todoListId: targetTodoListId, position })
      .where(eq(todoItems.id, itemId))
      .returning();

    if (result.length === 0) {
      return null;
    }

    const tagsByItemId = await this.getTagsForItems([result[0].id]);
    return { ...result[0], tags: tagsByItemId.get(result[0].id) ?? [] };
  }

  async reorderItems(
    todoListId: string,
    orderedItemIds: string[],
  ): Promise<TodoItem[]> {
    await this.db.transaction((tx) => {
      // Read the current items *inside* the transaction (rather than before
      // it starts) so a concurrent reorder can't race against this one using
      // a stale snapshot.
      const currentItems = tx.query.todoItems
        .findMany({
          where: eq(todoItems.todoListId, todoListId),
        })
        .sync();
      const currentIds = new Set(currentItems.map((item) => item.id));
      const orderedIdsSet = new Set(orderedItemIds);

      // `orderedItemIds` must be an exact permutation of the list's current
      // item ids - a partial or mismatched array would silently leave
      // omitted items at their old position while reassigning 0..N-1 to the
      // rest, producing duplicate/gapped positions.
      if (
        orderedItemIds.length !== currentItems.length ||
        orderedIdsSet.size !== orderedItemIds.length ||
        !orderedItemIds.every((id) => currentIds.has(id))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "orderedItemIds must contain exactly the todo list's current items",
        });
      }

      const currentPositionById = new Map(
        currentItems.map((item) => [item.id, item.position]),
      );

      for (let i = 0; i < orderedItemIds.length; i++) {
        // Skip the write if this item is already at the target position -
        // avoids rewriting every row on every reorder when only a couple of
        // items actually moved (e.g. an adjacent-item swap).
        if (currentPositionById.get(orderedItemIds[i]) === i) {
          continue;
        }

        tx.update(todoItems)
          .set({ position: i })
          .where(
            and(
              eq(todoItems.id, orderedItemIds[i]),
              eq(todoItems.todoListId, todoListId),
            ),
          )
          .run();
      }
    });

    return this.getItems(todoListId);
  }

  // --- Linked bookmarks (forward direction only: todo list -> bookmarks) ---
  //
  // This only resolves the *ids* of the linked bookmarks (joining
  // bookmarksInTodoLists -> bookmarks to make sure the bookmark still
  // exists). The service/router layer hydrates them into full render-ready
  // bookmarks via `Bookmark.loadMulti` (the same bookmark-hydration path
  // `bookmarks.getBookmarks` uses) instead of duplicating that fairly large
  // multi-table join here.
  async getLinkedBookmarkIds(todoListId: string): Promise<string[]> {
    const rows = await this.db
      .select({ bookmarkId: bookmarksInTodoLists.bookmarkId })
      .from(bookmarksInTodoLists)
      .innerJoin(bookmarks, eq(bookmarks.id, bookmarksInTodoLists.bookmarkId))
      .where(eq(bookmarksInTodoLists.todoListId, todoListId))
      .orderBy(desc(bookmarksInTodoLists.addedAt));

    return rows.map((r) => r.bookmarkId);
  }

  async getBookmarkOwnerId(bookmarkId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: bookmarks.userId })
      .from(bookmarks)
      .where(eq(bookmarks.id, bookmarkId));

    return row?.userId ?? null;
  }

  async attachBookmark(todoListId: string, bookmarkId: string): Promise<void> {
    await this.db
      .insert(bookmarksInTodoLists)
      .values({ todoListId, bookmarkId })
      .onConflictDoNothing();
  }

  async detachBookmark(todoListId: string, bookmarkId: string): Promise<void> {
    await this.db
      .delete(bookmarksInTodoLists)
      .where(
        and(
          eq(bookmarksInTodoLists.todoListId, todoListId),
          eq(bookmarksInTodoLists.bookmarkId, bookmarkId),
        ),
      );
  }

  // --- Linked bookmarks, item level (forward direction only: todo item ->
  // bookmarks) --- mirrors the todo-list-level methods above one level
  // down; see their comments for the rationale (ids-only here, hydrated
  // into full bookmarks by the service/router layer via `Bookmark.loadMulti`).
  async getLinkedBookmarkIdsForItem(todoItemId: string): Promise<string[]> {
    const rows = await this.db
      .select({ bookmarkId: bookmarksInTodoItems.bookmarkId })
      .from(bookmarksInTodoItems)
      .innerJoin(bookmarks, eq(bookmarks.id, bookmarksInTodoItems.bookmarkId))
      .where(eq(bookmarksInTodoItems.todoItemId, todoItemId))
      .orderBy(desc(bookmarksInTodoItems.addedAt));

    return rows.map((r) => r.bookmarkId);
  }

  async attachBookmarkToItem(
    todoItemId: string,
    bookmarkId: string,
  ): Promise<void> {
    await this.db
      .insert(bookmarksInTodoItems)
      .values({ todoItemId, bookmarkId })
      .onConflictDoNothing();
  }

  async detachBookmarkFromItem(
    todoItemId: string,
    bookmarkId: string,
  ): Promise<void> {
    await this.db
      .delete(bookmarksInTodoItems)
      .where(
        and(
          eq(bookmarksInTodoItems.todoItemId, todoItemId),
          eq(bookmarksInTodoItems.bookmarkId, bookmarkId),
        ),
      );
  }
}
