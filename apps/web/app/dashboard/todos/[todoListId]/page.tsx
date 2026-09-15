import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TodoItemsList from "@/components/dashboard/todos/TodoItemsList";
import TodoListHeader from "@/components/dashboard/todos/TodoListHeader";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ todoListId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const { todoLists } = await api.todoLists.list();
  const todoList = todoLists.find((l) => l.id === params.todoListId);
  return {
    title: `${todoList ? todoList.name : "Todo List"} | Karakeep`,
  };
}

export default async function TodoListPage(props: {
  params: Promise<{ todoListId: string }>;
}) {
  const params = await props.params;
  const { todoLists } = await api.todoLists.list();
  const todoList = todoLists.find((l) => l.id === params.todoListId);

  let items;
  try {
    const res = await api.todoLists.getItems({
      todoListId: params.todoListId,
    });
    items = res.items;
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
    throw e;
  }

  if (!todoList) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-8">
      <TodoListHeader initialData={todoList} />
      <TodoItemsList todoListId={todoList.id} initialItems={items} />
    </div>
  );
}
