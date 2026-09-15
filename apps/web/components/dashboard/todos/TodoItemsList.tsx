"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useTranslation } from "@/lib/i18n/client";
import { Plus } from "lucide-react";

import {
  useReorderTodoItems,
  useTodoItems,
} from "@karakeep/shared-react/hooks/todoLists";
import { ZTodoItem } from "@karakeep/shared/types/todos";

import { EditTodoItemDialog } from "./EditTodoItemDialog";
import TodoItemRow from "./TodoItemRow";

export default function TodoItemsList({
  todoListId,
  initialItems,
}: {
  todoListId: string;
  initialItems: ZTodoItem[];
}) {
  const { t } = useTranslation();

  const { data } = useTodoItems(
    { todoListId },
    { initialData: { items: initialItems } },
  );
  const items = [...(data?.items ?? initialItems)].sort(
    (a, b) => a.position - b.position,
  );

  const { mutate: reorderItems } = useReorderTodoItems({
    onError: () => {
      toast({
        variant: "destructive",
        description: t("common.something_went_wrong"),
      });
    },
  });

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
      <div className="flex justify-end">
        <EditTodoItemDialog defaultTodoListId={todoListId}>
          <Button type="button" className="gap-2">
            <Plus className="size-4" />
            {t("todos.add_item")}
          </Button>
        </EditTodoItemDialog>
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
