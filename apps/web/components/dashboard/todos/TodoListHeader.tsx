"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/client";
import { Pencil, Trash2 } from "lucide-react";

import { useTodoList } from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoList } from "@karakeep/shared/types/todos";

import DeleteTodoListConfirmationDialog from "./DeleteTodoListConfirmationDialog";
import { EditTodoListDialog } from "./EditTodoListDialog";

export default function TodoListHeader({
  initialData,
}: {
  initialData: ZTodoList;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data } = useTodoList({ todoListId: initialData.id }, { initialData });
  const todoList = data ?? initialData;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-4xl">
          {todoList.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold leading-tight">
            {todoList.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("todos.items_done", {
              done: todoList.doneCount,
              total: todoList.itemsCount,
            })}
          </p>
          {todoList.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {todoList.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  className="text-nowrap font-light"
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <EditTodoListDialog
        open={editOpen}
        setOpen={setEditOpen}
        todoList={todoList}
      />
      <DeleteTodoListConfirmationDialog
        todoList={todoList}
        open={deleteOpen}
        setOpen={setDeleteOpen}
      />
    </div>
  );
}
