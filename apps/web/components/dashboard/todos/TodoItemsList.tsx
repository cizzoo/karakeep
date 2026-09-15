"use client";

import { useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";

import {
  useAddTodoItem,
  useReorderTodoItems,
  useTodoItems,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItem } from "@karakeep/shared/types/todos";

import TodoItemRow from "./TodoItemRow";

export default function TodoItemsList({
  todoListId,
  initialItems,
}: {
  todoListId: string;
  initialItems: ZTodoItem[];
}) {
  const { t } = useTranslation();
  const [newItemText, setNewItemText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useTodoItems(
    { todoListId },
    { initialData: { items: initialItems } },
  );
  const items = [...(data?.items ?? initialItems)].sort(
    (a, b) => a.position - b.position,
  );

  const { mutate: addTodoItem, isPending: isAdding } = useAddTodoItem({
    onSuccess: () => {
      toast({ description: t("toasts.todos.item_added") });
      setNewItemText("");
      inputRef.current?.focus();
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const { mutate: reorderItems } = useReorderTodoItems({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

  const submitNewItem = () => {
    const trimmed = newItemText.trim();
    if (trimmed.length === 0) {
      return;
    }
    addTodoItem({ todoListId, text: trimmed });
  };

  const swap = (index: number, otherIndex: number) => {
    const orderedItemIds = items.map((i) => i.id);
    [orderedItemIds[index], orderedItemIds[otherIndex]] = [
      orderedItemIds[otherIndex],
      orderedItemIds[index],
    ];
    reorderItems({ todoListId, orderedItemIds });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submitNewItem();
            }
          }}
          placeholder={t("todos.add_item_placeholder")}
          className="grow"
        />
        <ActionButton type="button" loading={isAdding} onClick={submitNewItem}>
          {t("todos.add_item")}
        </ActionButton>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("todos.no_items")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <TodoItemRow
              key={item.id}
              item={item}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMoveUp={() => swap(index, index - 1)}
              onMoveDown={() => swap(index, index + 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
