"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import {
  useDeleteTodoItem,
  useEditTodoItem,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItem } from "@karakeep/shared/types/todos";

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const startEditing = () => {
    setEditValue(item.text);
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commitEdit = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed.length === 0 || trimmed === item.text) {
      return;
    }
    editTodoItem({ todoItemId: item.id, text: trimmed });
  };

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
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit();
            } else if (e.key === "Escape") {
              setIsEditing(false);
            }
          }}
          className="h-8 grow"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={cn(
            "grow truncate text-left text-sm",
            item.done && "text-muted-foreground line-through",
          )}
        >
          {item.text}
        </button>
      )}
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
    </div>
  );
}
