"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import {
  useDeleteTodoItem,
  useEditTodoItem,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItem } from "@karakeep/shared/types/todos";

import { EditTodoItemDialog } from "./EditTodoItemDialog";

export default function TodoItemRow({
  item,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  item: ZTodoItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);

  const { mutate: editTodoItem } = useEditTodoItem({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutate: deleteTodoItem, isPending: isDeleting } = useDeleteTodoItem({
    onSuccess: () => {
      toast({ description: t("toasts.todos.item_deleted") });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-2">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) =>
          editTodoItem({ todoItemId: item.id, done: e.target.checked })
        }
        className="size-4 shrink-0 cursor-pointer accent-primary"
      />
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="flex min-w-0 grow flex-wrap items-center gap-1.5 text-left"
      >
        <span
          className={cn(
            "truncate text-sm",
            item.done && "text-muted-foreground line-through",
          )}
        >
          {item.text}
        </span>
        {item.tags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-nowrap px-1.5 py-0 text-[10px] font-light"
              >
                {tag.name}
              </Badge>
            ))}
          </span>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isFirst}
          onClick={onMoveUp}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={isLast}
          onClick={onMoveDown}
        >
          <ChevronDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-destructive"
          disabled={isDeleting}
          onClick={() => deleteTodoItem({ todoItemId: item.id })}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <EditTodoItemDialog
        open={editOpen}
        setOpen={setEditOpen}
        todoItem={item}
      />
    </div>
  );
}
