import { beforeEach, describe, expect, test } from "vitest";

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

    await expect(() =>
      apiUser2.edit({ todoListId: listUser1.id, name: "Hacked" }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    await expect(() =>
      apiUser2.delete({ todoListId: listUser1.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    await expect(() =>
      apiUser2.getItems({ todoListId: listUser1.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    await expect(() =>
      apiUser2.editItem({ todoItemId: itemUser1.id, done: true }),
    ).rejects.toThrow(/User is not allowed to access resource/);

    await expect(() =>
      apiUser2.deleteItem({ todoItemId: itemUser1.id }),
    ).rejects.toThrow(/User is not allowed to access resource/);
  });
});
