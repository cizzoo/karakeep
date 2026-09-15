import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Todo List Routes", () => {
  test<CustomTestContext>("create todo list", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;

    const list = await api.create({ name: "Groceries", icon: "🛒" });
    expect(list.name).toEqual("Groceries");
    expect(list.icon).toEqual("🛒");
    expect(list.itemsCount).toEqual(0);
    expect(list.doneCount).toEqual(0);

    const res = await api.list();
    expect(res.todoLists.length).toEqual(1);
    expect(res.todoLists[0].id).toEqual(list.id);
    expect(res.todoLists[0].itemsCount).toEqual(0);
    expect(res.todoLists[0].doneCount).toEqual(0);
  });

  test<CustomTestContext>("add item to todo list", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });

    const item = await api.addItem({ todoListId: list.id, text: "Milk" });
    expect(item.text).toEqual("Milk");
    expect(item.done).toEqual(false);
    expect(item.position).toEqual(0);

    const secondItem = await api.addItem({
      todoListId: list.id,
      text: "Eggs",
    });
    expect(secondItem.position).toEqual(1);

    const items = await api.getItems({ todoListId: list.id });
    expect(items.items.length).toEqual(2);

    const res = await api.list();
    expect(res.todoLists[0].itemsCount).toEqual(2);
    expect(res.todoLists[0].doneCount).toEqual(0);
  });

  test<CustomTestContext>("edit item toggles done", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });
    const item = await api.addItem({ todoListId: list.id, text: "Milk" });

    const updated = await api.editItem({ todoItemId: item.id, done: true });
    expect(updated.done).toEqual(true);
    expect(updated.text).toEqual("Milk");

    const res = await api.list();
    expect(res.todoLists[0].doneCount).toEqual(1);
    expect(res.todoLists[0].itemsCount).toEqual(1);
  });

  test<CustomTestContext>("reorder items", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });
    const item1 = await api.addItem({ todoListId: list.id, text: "Milk" });
    const item2 = await api.addItem({ todoListId: list.id, text: "Eggs" });
    const item3 = await api.addItem({ todoListId: list.id, text: "Bread" });

    const reordered = await api.reorderItems({
      todoListId: list.id,
      orderedItemIds: [item3.id, item1.id, item2.id],
    });

    expect(reordered.items.map((i) => i.id)).toEqual([
      item3.id,
      item1.id,
      item2.id,
    ]);
    expect(reordered.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  test<CustomTestContext>("reorder adjacent items (swap via up/down)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });
    const item1 = await api.addItem({ todoListId: list.id, text: "Milk" });
    const item2 = await api.addItem({ todoListId: list.id, text: "Eggs" });
    const item3 = await api.addItem({ todoListId: list.id, text: "Bread" });

    // Matches the UI's up/down chevron behavior: only two adjacent items
    // (positions 1 and 2) trade places, item at position 0 stays put.
    const reordered = await api.reorderItems({
      todoListId: list.id,
      orderedItemIds: [item1.id, item3.id, item2.id],
    });

    expect(reordered.items.map((i) => i.id)).toEqual([
      item1.id,
      item3.id,
      item2.id,
    ]);
    expect(reordered.items.map((i) => i.position)).toEqual([0, 1, 2]);
  });

  test<CustomTestContext>("delete item", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });
    const item = await api.addItem({ todoListId: list.id, text: "Milk" });

    await api.deleteItem({ todoItemId: item.id });

    const items = await api.getItems({ todoListId: list.id });
    expect(items.items.length).toEqual(0);
  });

  test<CustomTestContext>("delete todo list", async ({ apiCallers }) => {
    const api = apiCallers[0].todoLists;
    const list = await api.create({ name: "Groceries" });

    await api.delete({ todoListId: list.id });

    const res = await api.list();
    expect(res.todoLists.length).toEqual(0);
  });

  test<CustomTestContext>("privacy for todo lists and items", async ({
    apiCallers,
  }) => {
    const apiUser1 = apiCallers[0].todoLists;
    const apiUser2 = apiCallers[1].todoLists;

    const listUser1 = await apiUser1.create({ name: "User1 List" });
    const itemUser1 = await apiUser1.addItem({
      todoListId: listUser1.id,
      text: "User1 item",
    });

    // Todo list ownership denials come back as NOT_FOUND (not FORBIDDEN) to
    // avoid leaking whether a given todoListId exists at all - see
    // `TodoListsService.getTodoList`'s `notFoundOnDeny`.
    await expect(() =>
      apiUser2.edit({ todoListId: listUser1.id, name: "Hacked" }),
    ).rejects.toThrow(/not found/i);

    await expect(() =>
      apiUser2.delete({ todoListId: listUser1.id }),
    ).rejects.toThrow(/not found/i);

    await expect(() =>
      apiUser2.getItems({ todoListId: listUser1.id }),
    ).rejects.toThrow(/not found/i);

    await expect(() =>
      apiUser2.editItem({ todoItemId: itemUser1.id, done: true }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    await expect(() =>
      apiUser2.deleteItem({ todoItemId: itemUser1.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);
  });

  describe("Tags", () => {
    test<CustomTestContext>("attaching a tag by name creates it, and a todo list's tags come back correctly from get/list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Groceries" });

      const result = await api.updateTags({
        todoListId: list.id,
        attach: [{ tagName: "urgent" }, { tagName: "shopping" }],
        detach: [],
      });
      expect(result.attached.length).toEqual(2);
      expect(result.detached.length).toEqual(0);

      const fromGet = await api.get({ todoListId: list.id });
      expect(fromGet.tags.map((t) => t.name).sort()).toEqual([
        "shopping",
        "urgent",
      ]);

      const fromList = await api.list();
      expect(fromList.todoLists[0].tags.map((t) => t.name).sort()).toEqual([
        "shopping",
        "urgent",
      ]);
    });

    test<CustomTestContext>("attaching an existing tag (by id and by name) reuses the same bookmarkTags row instead of duplicating it", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const tagsApi = apiCallers[0].tags;

      // Seed a tag the way the shared bookmark tag pool would have one.
      const existingTag = await tagsApi.create({ name: "shared-tag" });

      const list1 = await api.create({ name: "List 1" });
      const list2 = await api.create({ name: "List 2" });

      // Attach by id to the first list.
      await api.updateTags({
        todoListId: list1.id,
        attach: [{ tagId: existingTag.id }],
        detach: [],
      });
      // Attach by (identical) name to the second list.
      await api.updateTags({
        todoListId: list2.id,
        attach: [{ tagName: "shared-tag" }],
        detach: [],
      });

      const list1Tags = await api.get({ todoListId: list1.id });
      const list2Tags = await api.get({ todoListId: list2.id });
      expect(list1Tags.tags).toEqual([
        { id: existingTag.id, name: "shared-tag" },
      ]);
      expect(list2Tags.tags).toEqual([
        { id: existingTag.id, name: "shared-tag" },
      ]);

      // No duplicate bookmarkTags row was created for "shared-tag".
      const allTags = await tagsApi.list({});
      expect(
        allTags.tags.filter((t) => t.name === "shared-tag").length,
      ).toEqual(1);
    });

    test<CustomTestContext>("detach a tag from a todo list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Groceries" });

      const { attached } = await api.updateTags({
        todoListId: list.id,
        attach: [{ tagName: "urgent" }],
        detach: [],
      });
      expect((await api.get({ todoListId: list.id })).tags.length).toEqual(1);

      const detachResult = await api.updateTags({
        todoListId: list.id,
        attach: [],
        detach: [{ tagId: attached[0] }],
      });
      expect(detachResult.detached).toEqual(attached);

      const afterDetach = await api.get({ todoListId: list.id });
      expect(afterDetach.tags).toEqual([]);
    });

    test<CustomTestContext>("privacy: a second user can't read or modify another user's todo list tags", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      await apiUser1.updateTags({
        todoListId: listUser1.id,
        attach: [{ tagName: "user1-secret" }],
        detach: [],
      });

      await expect(() =>
        apiUser2.get({ todoListId: listUser1.id }),
      ).rejects.toThrow(/not found/i);

      await expect(() =>
        apiUser2.updateTags({
          todoListId: listUser1.id,
          attach: [{ tagName: "hacked" }],
          detach: [],
        }),
      ).rejects.toThrow(/not found/i);

      // User1's tags are untouched.
      const list = await apiUser1.get({ todoListId: listUser1.id });
      expect(list.tags.map((t) => t.name)).toEqual(["user1-secret"]);
    });
  });

  describe("Item tags", () => {
    test<CustomTestContext>("attaching a tag by name creates it, and reuses the same bookmarkTags row for a second item", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const tagsApi = apiCallers[0].tags;
      const list = await api.create({ name: "Groceries" });
      const item1 = await api.addItem({ todoListId: list.id, text: "Milk" });
      const item2 = await api.addItem({ todoListId: list.id, text: "Eggs" });

      const result1 = await api.updateItemTags({
        todoItemId: item1.id,
        attach: [{ tagName: "urgent" }],
        detach: [],
      });
      expect(result1.attached.length).toEqual(1);
      expect(result1.todoListId).toEqual(list.id);

      const result2 = await api.updateItemTags({
        todoItemId: item2.id,
        attach: [{ tagName: "urgent" }],
        detach: [],
      });
      expect(result2.attached).toEqual(result1.attached);

      // No duplicate bookmarkTags row was created for "urgent".
      const allTags = await tagsApi.list({});
      expect(allTags.tags.filter((t) => t.name === "urgent").length).toEqual(1);
    });

    test<CustomTestContext>("tags round-trip through getItems", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Groceries" });
      const item = await api.addItem({ todoListId: list.id, text: "Milk" });

      await api.updateItemTags({
        todoItemId: item.id,
        attach: [{ tagName: "urgent" }, { tagName: "shopping" }],
        detach: [],
      });

      const items = await api.getItems({ todoListId: list.id });
      expect(
        items.items
          .find((i) => i.id === item.id)
          ?.tags.map((t) => t.name)
          .sort(),
      ).toEqual(["shopping", "urgent"]);
    });

    test<CustomTestContext>("detach a tag from a todo item", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Groceries" });
      const item = await api.addItem({ todoListId: list.id, text: "Milk" });

      const { attached } = await api.updateItemTags({
        todoItemId: item.id,
        attach: [{ tagName: "urgent" }],
        detach: [],
      });

      const detachResult = await api.updateItemTags({
        todoItemId: item.id,
        attach: [],
        detach: [{ tagId: attached[0] }],
      });
      expect(detachResult.detached).toEqual(attached);

      const items = await api.getItems({ todoListId: list.id });
      expect(items.items.find((i) => i.id === item.id)?.tags).toEqual([]);
    });

    test<CustomTestContext>("privacy: a second user can't read or modify another user's todo item tags", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      const itemUser1 = await apiUser1.addItem({
        todoListId: listUser1.id,
        text: "User1 item",
      });
      await apiUser1.updateItemTags({
        todoItemId: itemUser1.id,
        attach: [{ tagName: "user1-secret" }],
        detach: [],
      });

      await expect(() =>
        apiUser2.updateItemTags({
          todoItemId: itemUser1.id,
          attach: [{ tagName: "hacked" }],
          detach: [],
        }),
      ).rejects.toThrow(/User is not allowed to access resource/);

      // User1's item tags are untouched.
      const items = await apiUser1.getItems({ todoListId: listUser1.id });
      expect(
        items.items.find((i) => i.id === itemUser1.id)?.tags.map((t) => t.name),
      ).toEqual(["user1-secret"]);
    });
  });

  describe("Move item", () => {
    test<CustomTestContext>("moving an item to another of the same user's lists updates todoListId and repositions it", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const sourceList = await api.create({ name: "Source" });
      const targetList = await api.create({ name: "Target" });

      const item = await api.addItem({
        todoListId: sourceList.id,
        text: "Milk",
      });
      // Give the target list an existing item so we can check the moved
      // item lands after it (max position + 1), not just at 0.
      const existingTargetItem = await api.addItem({
        todoListId: targetList.id,
        text: "Bread",
      });

      const moved = await api.moveItem({
        todoItemId: item.id,
        targetTodoListId: targetList.id,
      });
      expect(moved.id).toEqual(item.id);
      expect(moved.todoListId).toEqual(targetList.id);
      expect(moved.position).toBeGreaterThan(existingTargetItem.position);

      const sourceItems = await api.getItems({ todoListId: sourceList.id });
      expect(sourceItems.items.map((i) => i.id)).toEqual([]);

      const targetItems = await api.getItems({ todoListId: targetList.id });
      expect(targetItems.items.map((i) => i.id).sort()).toEqual(
        [existingTargetItem.id, item.id].sort(),
      );
    });

    test<CustomTestContext>("moving an item into a list belonging to a different user is rejected", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      const itemUser1 = await apiUser1.addItem({
        todoListId: listUser1.id,
        text: "User1 item",
      });
      const listUser2 = await apiUser2.create({ name: "User2 List" });

      // The target list belongs to another user, so the target-list
      // ownership check (`TodoListsService.getTodoList`) rejects it as
      // NOT_FOUND rather than FORBIDDEN.
      await expect(() =>
        apiUser1.moveItem({
          todoItemId: itemUser1.id,
          targetTodoListId: listUser2.id,
        }),
      ).rejects.toThrow(/not found/i);

      // The item never moved.
      const items = await apiUser1.getItems({ todoListId: listUser1.id });
      expect(items.items.map((i) => i.id)).toEqual([itemUser1.id]);
    });

    test<CustomTestContext>("moving another user's item is rejected", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      const itemUser1 = await apiUser1.addItem({
        todoListId: listUser1.id,
        text: "User1 item",
      });
      const listUser2 = await apiUser2.create({ name: "User2 List" });

      await expect(() =>
        apiUser2.moveItem({
          todoItemId: itemUser1.id,
          targetTodoListId: listUser2.id,
        }),
      ).rejects.toThrow(/User is not allowed to access resource/);
    });
  });

  describe("Linked bookmarks", () => {
    test<CustomTestContext>("attaching a bookmark makes it show up in the linked-bookmarks list, and detaching removes it", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Reading" });
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Some note to read later",
      });

      const beforeAttach = await api.getLinkedBookmarks({
        todoListId: list.id,
      });
      expect(beforeAttach.bookmarks).toEqual([]);

      await api.attachBookmark({
        todoListId: list.id,
        bookmarkId: bookmark.id,
      });

      const afterAttach = await api.getLinkedBookmarks({
        todoListId: list.id,
      });
      expect(afterAttach.bookmarks.map((b) => b.id)).toEqual([bookmark.id]);

      await api.detachBookmark({
        todoListId: list.id,
        bookmarkId: bookmark.id,
      });

      const afterDetach = await api.getLinkedBookmarks({
        todoListId: list.id,
      });
      expect(afterDetach.bookmarks).toEqual([]);
    });

    test<CustomTestContext>("attaching a bookmark that belongs to a different user is rejected", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const list = await apiUser1.create({ name: "Reading" });

      const user2Bookmark = await apiCallers[1].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User2's private note",
      });

      await expect(() =>
        apiUser1.attachBookmark({
          todoListId: list.id,
          bookmarkId: user2Bookmark.id,
        }),
      ).rejects.toThrow(/not found/i);

      const linked = await apiUser1.getLinkedBookmarks({
        todoListId: list.id,
      });
      expect(linked.bookmarks).toEqual([]);
    });

    test<CustomTestContext>("privacy: a second user can't read or modify another user's todo list's linked bookmarks", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      const user1Bookmark = await apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User1's note",
      });
      await apiUser1.attachBookmark({
        todoListId: listUser1.id,
        bookmarkId: user1Bookmark.id,
      });

      const user2Bookmark = await apiCallers[1].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User2's note",
      });

      await expect(() =>
        apiUser2.getLinkedBookmarks({ todoListId: listUser1.id }),
      ).rejects.toThrow(/not found/i);

      await expect(() =>
        apiUser2.attachBookmark({
          todoListId: listUser1.id,
          bookmarkId: user2Bookmark.id,
        }),
      ).rejects.toThrow(/not found/i);

      await expect(() =>
        apiUser2.detachBookmark({
          todoListId: listUser1.id,
          bookmarkId: user1Bookmark.id,
        }),
      ).rejects.toThrow(/not found/i);

      // User1's linked bookmark is untouched.
      const linked = await apiUser1.getLinkedBookmarks({
        todoListId: listUser1.id,
      });
      expect(linked.bookmarks.map((b) => b.id)).toEqual([user1Bookmark.id]);
    });
  });

  describe("Item linked bookmarks", () => {
    test<CustomTestContext>("attaching a bookmark makes it show up in the item's linked-bookmarks list, and detaching removes it", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].todoLists;
      const list = await api.create({ name: "Reading" });
      const item = await api.addItem({ todoListId: list.id, text: "Milk" });
      const bookmark = await apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Some note to read later",
      });

      const beforeAttach = await api.getLinkedBookmarksForItem({
        todoItemId: item.id,
      });
      expect(beforeAttach.bookmarks).toEqual([]);

      await api.attachBookmarkToItem({
        todoItemId: item.id,
        bookmarkId: bookmark.id,
      });

      const afterAttach = await api.getLinkedBookmarksForItem({
        todoItemId: item.id,
      });
      expect(afterAttach.bookmarks.map((b) => b.id)).toEqual([bookmark.id]);

      await api.detachBookmarkFromItem({
        todoItemId: item.id,
        bookmarkId: bookmark.id,
      });

      const afterDetach = await api.getLinkedBookmarksForItem({
        todoItemId: item.id,
      });
      expect(afterDetach.bookmarks).toEqual([]);
    });

    test<CustomTestContext>("attaching a bookmark that belongs to a different user is rejected", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const list = await apiUser1.create({ name: "Reading" });
      const item = await apiUser1.addItem({
        todoListId: list.id,
        text: "Milk",
      });

      const user2Bookmark = await apiCallers[1].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User2's private note",
      });

      await expect(() =>
        apiUser1.attachBookmarkToItem({
          todoItemId: item.id,
          bookmarkId: user2Bookmark.id,
        }),
      ).rejects.toThrow(/not found/i);

      const linked = await apiUser1.getLinkedBookmarksForItem({
        todoItemId: item.id,
      });
      expect(linked.bookmarks).toEqual([]);
    });

    test<CustomTestContext>("privacy: a second user can't read or modify another user's todo item's linked bookmarks", async ({
      apiCallers,
    }) => {
      const apiUser1 = apiCallers[0].todoLists;
      const apiUser2 = apiCallers[1].todoLists;

      const listUser1 = await apiUser1.create({ name: "User1 List" });
      const itemUser1 = await apiUser1.addItem({
        todoListId: listUser1.id,
        text: "User1 item",
      });
      const user1Bookmark = await apiCallers[0].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User1's note",
      });
      await apiUser1.attachBookmarkToItem({
        todoItemId: itemUser1.id,
        bookmarkId: user1Bookmark.id,
      });

      const user2Bookmark = await apiCallers[1].bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "User2's note",
      });

      await expect(() =>
        apiUser2.getLinkedBookmarksForItem({ todoItemId: itemUser1.id }),
      ).rejects.toThrow(/User is not allowed to access resource/);

      await expect(() =>
        apiUser2.attachBookmarkToItem({
          todoItemId: itemUser1.id,
          bookmarkId: user2Bookmark.id,
        }),
      ).rejects.toThrow(/User is not allowed to access resource/);

      await expect(() =>
        apiUser2.detachBookmarkFromItem({
          todoItemId: itemUser1.id,
          bookmarkId: user1Bookmark.id,
        }),
      ).rejects.toThrow(/User is not allowed to access resource/);

      // User1's linked bookmark is untouched.
      const linked = await apiUser1.getLinkedBookmarksForItem({
        todoItemId: itemUser1.id,
      });
      expect(linked.bookmarks.map((b) => b.id)).toEqual([user1Bookmark.id]);
    });
  });
});
