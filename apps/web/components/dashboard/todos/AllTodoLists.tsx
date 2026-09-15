"use client";

import { useTranslation } from "@/lib/i18n/client";
import { ListTodo } from "lucide-react";

import { useTodoLists } from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoList } from "@karakeep/shared/types/todos";

import TodoListCard from "./TodoListCard";

export default function AllTodoLists({
  initialData,
}: {
  initialData: ZTodoList[];
}) {
  const { t } = useTranslation();
  const { data } = useTodoLists({
    initialData: { todoLists: initialData },
  });
  const todoLists = data?.todoLists ?? initialData;

  if (todoLists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border bg-background p-10 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <ListTodo className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-xl font-medium text-foreground">
          {t("todos.no_todo_lists")}
        </h3>
        <p className="max-w-md text-muted-foreground">
          {t("todos.no_todo_lists_description")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {todoLists.map((todoList) => (
        <TodoListCard key={todoList.id} todoList={todoList} />
      ))}
    </div>
  );
}
