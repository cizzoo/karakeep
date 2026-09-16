import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LinkedBookmarksSection } from "@/components/dashboard/todos/LinkedBookmarksSection";
import TodoItemsList from "@/components/dashboard/todos/TodoItemsList";
import TodoListHeader from "@/components/dashboard/todos/TodoListHeader";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ todoListId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  let todoList;
  try {
    todoList = await api.todoLists.get({ todoListId: params.todoListId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      return { title: "Todo List | Karakeep" };
    }
    throw e;
  }
  return {
    title: `${todoList.name} | Karakeep`,
  };
}

export default async function TodoListPage(props: {
  params: Promise<{ todoListId: string }>;
}) {
  const params = await props.params;

  let todoList;
  let items;
  let linkedBookmarks;
  try {
    todoList = await api.todoLists.get({ todoListId: params.todoListId });
    const res = await api.todoLists.getItems({
      todoListId: params.todoListId,
    });
    items = res.items;
    linkedBookmarks = await api.todoLists.getLinkedBookmarks({
      todoListId: params.todoListId,
    });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }

  return (
    <div className="flex flex-col gap-8">
      <TodoListHeader initialData={todoList} />
      <TodoItemsList todoListId={todoList.id} initialItems={items} />
      <LinkedBookmarksSection
        todoListId={todoList.id}
        initialData={linkedBookmarks}
      />
    </div>
  );
}
