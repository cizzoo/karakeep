"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/lib/i18n/client";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { ZTodoList } from "@karakeep/shared/types/todos";

import DeleteTodoListConfirmationDialog from "./DeleteTodoListConfirmationDialog";
import { EditTodoListDialog } from "./EditTodoListDialog";

export default function TodoListCard({ todoList }: { todoList: ZTodoList }) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const progress =
    todoList.itemsCount > 0
      ? (todoList.doneCount / todoList.itemsCount) * 100
      : 0;

  return (
    <Card className="relative">
      <Link
        href={`/dashboard/todos/${todoList.id}`}
        className="absolute inset-0 rounded-lg"
        aria-label={todoList.name}
      />
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl">
            {todoList.icon}
          </span>
          <p className="truncate text-lg font-semibold">{todoList.name}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 shrink-0"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="relative z-10">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" />
              {t("actions.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setDeleteOpen(true)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-2">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground">
          {t("todos.items_done", {
            done: todoList.doneCount,
            total: todoList.itemsCount,
          })}
        </p>
        {todoList.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
      </CardContent>
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
    </Card>
  );
}
